/**
 * Live Detections Speech Hook - Converts object detection results to spoken announcements
 * Provides intelligent speech synthesis for real-time object detection with smoothing and prioritization
 */
import {
    CRITICAL_LABELS,
    DIRECTION_ORDER,
    INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT,
    MAX_DIRECTION_MENTIONS,
    MAX_GROUPS_SPOKEN
} from '@/constants/detection';
import { useDirectionSmoothing } from '@/hooks/useDirectionSmoothing';
import { useDistanceMetersSmoothing } from '@/hooks/useDistanceMetersSmoothing';
import { classifyChange, type Signature } from '@/services/detections/signature';
import { type SpeechPriority } from '@/services/speechSupervisor';
import {
    bucketCount,
    directionDescriptor,
    humanizeLabel,
    joinHuman,
    naturalLabel,
    pluralize,
    postPhraseSanitize,
} from '@/utils/text';
import React from 'react';

type Obj = any;
type RequestSpeak = (phrase: string, priority: SpeechPriority) => void;

// Objects that are acceptable at medium distance
const MED_OK_LABELS = new Set(['car', 'truck', 'van', 'bicycle', 'motorcycle']);

/**
 * Hook for converting live object detections to spoken announcements
 * Handles smoothing, prioritization, and natural language generation
 */
export function useLiveDetectionsSpeech(params: {
    enabled: boolean;
    objects: Obj[];
    requestSpeak: RequestSpeak;
}) {
    const { enabled, objects, requestSpeak } = params;

    // Smoothing hooks for stable direction and distance reporting
    const { smoothDirection, purgeDirCache } = useDirectionSmoothing();
    const { smoothMeters, purgeDistCache } = useDistanceMetersSmoothing();
    const lastSigRef = React.useRef<Signature | null>(null);

    React.useEffect(() => {
        if (!enabled) return;
        const rawList = (objects ?? []) as Obj[];
        const now = Date.now();
        // Clean up old smoothing data
        purgeDirCache(now);
        purgeDistCache(now);
        if (!rawList.length) return;

        type Info = {
            id: number;
            nat: string;
            score?: number;
            dir?: string | null;
            dm?: number;
            dconf?: 'high' | 'med' | 'low';
        };

        const infos: Info[] = rawList
            .map((o) => {
                const top = Array.isArray(o.labels) && o.labels.length > 0 ? o.labels[0] : null;
                const base = top?.name as string | undefined;

                // Center-based 3x3 direction
                const b = Array.isArray(o.b) ? o.b : [];
                let xc: number | undefined, yc: number | undefined;
                if (b.length === 4) {
                    const [x, y, w, h] = b as [number, number, number, number];
                    xc = x + w / 2;
                    yc = y + h / 2;
                }
                const rawDir = xc != null && yc != null ? directionDescriptor(xc, yc) : null;
                const dir = smoothDirection(o.id ?? -1, rawDir, now);

                // Smooth meters per-id (extra debounce on top of native)
                const rawDm = typeof o.distance_m === 'number' && o.distance_m > 0 ? (o.distance_m as number) : undefined;
                const rawConf = typeof o.distance_conf === 'string' ? (o.distance_conf as 'high' | 'med' | 'low') : undefined;
                const { display: dm } = smoothMeters(o.id ?? -1, rawDm, rawConf, now);

                return {
                    id: o.id ?? -1,
                    nat: naturalLabel(base),
                    score: typeof top?.c === 'number' ? top.c : undefined,
                    dir,
                    dm,
                    dconf: rawConf,
                };
            })
            .filter((i) => i.nat);

        if (!infos.length) return;

        // Group by naturalized label
        const groupsMap = new Map<string, Info[]>();
        infos.forEach((i) => {
            if (!groupsMap.has(i.nat)) groupsMap.set(i.nat, []);
            groupsMap.get(i.nat)!.push(i);
        });

        type GroupPhraseObj = {
            phrase: string;
            nat: string;
            priority: number; // lower = more important
            total: number;
            critical: boolean;
        };

        const groupPhrases: GroupPhraseObj[] = [];

        groupsMap.forEach((arr, nat) => {
            const critical = CRITICAL_LABELS.has(nat);
            const total = arr.length;

            const phrase = buildGroupPhraseSimple(arr, nat, total);
            // Priority: critical labels first; non-critical next
            const priority = critical ? 0 : 1;

            groupPhrases.push({
                phrase: postPhraseSanitize(phrase),
                nat,
                priority,
                total,
                critical,
            });
        });

        // Sort candidates to speak
        groupPhrases.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.total !== b.total) return b.total - a.total;
            return a.nat.localeCompare(b.nat);
        });

        const selected = groupPhrases.slice(0, MAX_GROUPS_SPOKEN);
        if (!selected.length) return;

        // Build final phrase
        let finalPhrase: string;
        if (selected.length === 1) finalPhrase = selected[0].phrase;
        else {
            const parts = selected.map((g) => g.phrase);
            finalPhrase =
                parts.length === 2
                    ? `${parts[0]} and ${parts[1]}`
                    : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
        }

        // Emit with change classifier — simplified signature
        const sig: Signature = {
            groups: selected.map((g) => ({
                nat: g.nat,
                priority: g.priority,
                totalBucket: bucketCount(g.total),
                critical: g.critical,
            })),
            hasCritical: selected.some((g) => g.critical),
            sumBucket: bucketCount(selected.reduce((a, g) => a + g.total, 0)),
        };

        const prevSig = lastSigRef.current;
        const changeClass = classifyChange(prevSig, sig);
        if (changeClass !== 'none') {
            requestSpeak(postPhraseSanitize(finalPhrase), changeClass);
        }
        lastSigRef.current = sig;
    }, [enabled, objects, purgeDirCache, purgeDistCache, smoothDirection, smoothMeters, requestSpeak]);

    function buildGroupPhraseSimple(
        arr: { nat: string; dir?: string | null; dm?: number; dconf?: 'high' | 'med' | 'low' }[],
        nat: string,
        total: number
    ): string {
        const label = humanizeLabel(nat);

        if (total === 1) {
            const o = arr[0];

            // meters tail if confidence adequate after smoothing:
            // allow when high, or med for critical + common traffic objects
            const allowMeters =
                o.dm != null &&
                !!o.dconf &&
                (o.dconf === 'high' || (o.dconf === 'med' && (CRITICAL_LABELS.has(nat) || MED_OK_LABELS.has(nat))));
            const numTail = allowMeters
                ? `, about ${o.dm! < 10 ? o.dm!.toFixed(1) : Math.round(o.dm!)} meters`
                : '';

            // direction phrasing: keep 3x3, include "directly ahead" if present
            const dir = o.dir ? ` ${o.dir}` : '';

            return `${label}${dir}${numTail}`;
        }

        // Multi-object phrasing without categories
        const allDirs = arr.every((o) => o.dir);
        if (allDirs && total <= INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT) {
            const dirs = arr
                .map((o) => o.dir!)
                .reduce<string[]>((acc, d) => {
                    if (!acc.includes(d)) acc.push(d);
                    return acc;
                }, [])
                .sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99))
                .slice(0, MAX_DIRECTION_MENTIONS);

            if (dirs.length > 0) {
                const dirPart = dirs.length === 1 ? dirs[0] : joinHuman(dirs);
                return `${total} ${pluralize(label, total)}: ${dirPart}`;
            }
        }

        // Generic count if not all directional or group is large
        return `${total} ${pluralize(label, total)}`;
    }
}

export default useLiveDetectionsSpeech;