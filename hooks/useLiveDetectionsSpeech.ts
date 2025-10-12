import {
    CRITICAL_LABELS,
    DIRECTION_ORDER,
    DIST_PRIORITY,
    ID_ABSENCE_MS,
    INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT,
    MAX_DIRECTION_MENTIONS,
    MAX_GROUPS_SPOKEN,
    MIN_BUCKET_SPEAK_INTERVAL_MS,
    MULTI_COUNT_LABELS,
    NEAR_DEESC_DELAY_MS,
    SMALL_GROUP_MAX,
} from '@/constants/detection';
import { useDirectionSmoothing } from '@/hooks/useDirectionSmoothing';
import { useDistanceCategorySmoothing, type DistCat } from '@/hooks/useDistanceCategorySmoothing';
import { classifyChange, type Signature } from '@/services/detections/signature';
import { type SpeechPriority } from '@/services/speechSupervisor';
import {
    bucketCount,
    bucketToPhrase,
    directionDescriptor,
    humanizeLabel,
    joinHuman,
    mapCountToSemanticBucket,
    naturalLabel,
    pluralize,
    postPhraseSanitize,
} from '@/utils/text';
import React from 'react';

type Obj = any;
type RequestSpeak = (phrase: string, priority: SpeechPriority) => void;

export function useLiveDetectionsSpeech(params: {
    enabled: boolean;
    objects: Obj[];
    requestSpeak: RequestSpeak;
}) {
    const { enabled, objects, requestSpeak } = params;

    const { smoothDirection, purgeDirCache } = useDirectionSmoothing();
    const { smoothDistCat, purgeDistCache } = useDistanceCategorySmoothing();
    const lastSigRef = React.useRef<Signature | null>(null);

    type PerLabelState = {
        lastBucket: string | null;
        lastBucketSpokenAt: number;
        lastNearState: 'none' | 'near' | 'mid' | 'far' | null;
        lastNearChangeAt: number;
        idLastSeen: Map<number, number>;
    };
    const perLabelStateRef = React.useRef<Map<string, PerLabelState>>(new Map());
    const getPerLabelState = React.useCallback((label: string): PerLabelState => {
        let s = perLabelStateRef.current.get(label);
        if (!s) {
            s = {
                lastBucket: null,
                lastBucketSpokenAt: 0,
                lastNearState: null,
                lastNearChangeAt: 0,
                idLastSeen: new Map(),
            };
            perLabelStateRef.current.set(label, s);
        }
        return s;
    }, []);

    React.useEffect(() => {
        if (!enabled) return;
        const rawList = (objects ?? []) as Obj[];
        const now = Date.now();
        purgeDirCache(now);
        purgeDistCache(now);
        if (!rawList.length) return;

        type Info = {
            id: number;
            nat: string;
            distCat?: DistCat; // smoothed categorical distance
            score?: number;
            dir?: string | null;
            dm?: number;
            dconf?: 'high' | 'med' | 'low';
        };

        const infos: Info[] = rawList
            .map((o) => {
                const top = Array.isArray(o.labels) && o.labels.length > 0 ? o.labels[0] : null;
                const base = top?.name as string | undefined;

                // Use only "stable" distance categories as raw input to smoother
                let rawStableCat: DistCat | null = null;
                if (
                    typeof o.distance_cat === 'string' &&
                    o.distance_cat_conf === 'stable'
                ) {
                    const val = o.distance_cat as string;
                    rawStableCat =
                        val === 'near' || val === 'mid' || val === 'far' ? (val as DistCat) : 'unknown';
                }

                const b = Array.isArray(o.b) ? o.b : [];
                let xc: number | undefined, yc: number | undefined;
                if (b.length === 4) {
                    const [x, y, w, h] = b as [number, number, number, number];
                    xc = x + w / 2;
                    yc = y + h / 2;
                }
                const rawDir = xc != null && yc != null ? directionDescriptor(xc, yc) : null;

                const dm = typeof o.distance_m === 'number' && o.distance_m > 0 ? (o.distance_m as number) : undefined;
                const dconf = typeof o.distance_conf === 'string' ? (o.distance_conf as 'high' | 'med' | 'low') : undefined;

                return {
                    id: o.id ?? -1,
                    nat: naturalLabel(base),
                    distCat: smoothDistCat(o.id ?? -1, rawStableCat, now) || undefined,
                    score: typeof top?.c === 'number' ? top.c : undefined,
                    dir: smoothDirection(o.id ?? -1, rawDir, now),
                    dm,
                    dconf,
                };
            })
            .filter((i) => i.nat);

        if (!infos.length) return;

        const groupsMap = new Map<string, Info[]>();
        infos.forEach((i) => {
            if (!groupsMap.has(i.nat)) groupsMap.set(i.nat, []);
            groupsMap.get(i.nat)!.push(i);
        });

        type GroupPhraseObj = {
            phrase: string;
            nat: string;
            priority: number;
            total: number;
            hasNear: boolean;
            critical: boolean;
            catCounts: Map<string, number>;
            overrideSpoken?: boolean;
        };

        const groupPhrases: GroupPhraseObj[] = [];

        groupsMap.forEach((arr, nat) => {
            const catCounts = new Map<string, number>();
            arr.forEach((i) => {
                const c = i.distCat || 'unknown';
                catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
            });
            const stableCats = Array.from(catCounts.keys()).filter((c) => c !== 'unknown');
            const priority = stableCats.length ? Math.min(...stableCats.map((c) => DIST_PRIORITY[c] ?? 3)) : 3;
            const total = arr.length;
            const uniformCat = stableCats.length === 1 && catCounts.get(stableCats[0]) === total;
            let phrase = buildGroupPhrase(arr, nat, total, uniformCat, stableCats, catCounts);
            const hasNear = (catCounts.get('near') ?? 0) > 0;
            const critical = CRITICAL_LABELS.has(nat);

            if (MULTI_COUNT_LABELS.has(nat)) {
                const st = getPerLabelState(nat);
                arr.forEach((o) => {
                    if (o.id && o.id !== -1) st.idLastSeen.set(o.id, now);
                });
                for (const [id, ts] of Array.from(st.idLastSeen.entries())) {
                    if (now - ts > ID_ABSENCE_MS) st.idLastSeen.delete(id);
                }
                const stableCount = st.idLastSeen.size;
                const bucket = mapCountToSemanticBucket(stableCount);

                let minCat: string = 'unknown';
                let minVal = 99;
                arr.forEach((a) => {
                    if (!st.idLastSeen.has(a.id)) return;
                    const dc = (a.distCat || 'unknown') as DistCat;
                    const p = DIST_PRIORITY[dc] ?? 99;
                    if (p < minVal) {
                        minVal = p;
                        minCat = dc;
                    }
                });

                let nearState: 'none' | 'near' | 'mid' | 'far';
                if (bucket === 'none') nearState = 'none';
                else if (minCat === 'near') nearState = 'near';
                else if (minCat === 'mid') nearState = 'mid';
                else if (minCat === 'far') nearState = 'far';
                else nearState = 'mid';

                const bucketChanged = bucket !== st.lastBucket;
                const nearChanged = nearState !== st.lastNearState;
                const nowSinceBucket = now - st.lastBucketSpokenAt;
                const nowSinceNearChange = now - st.lastNearChangeAt;

                let shouldSpeak = false;
                let reason: 'nearEscalation' | 'bucketChange' | 'nearRetreat' | '' = '';
                if (st.lastNearState !== 'near' && nearState === 'near') {
                    shouldSpeak = true;
                    reason = 'nearEscalation';
                } else if (bucketChanged && bucket !== 'none' && nowSinceBucket >= MIN_BUCKET_SPEAK_INTERVAL_MS) {
                    shouldSpeak = true;
                    reason = 'bucketChange';
                } else if (nearChanged && (nearState === 'mid' || nearState === 'far')) {
                    if (nowSinceNearChange >= NEAR_DEESC_DELAY_MS) {
                        shouldSpeak = true;
                        reason = 'nearRetreat';
                    }
                }

                if (shouldSpeak) {
                    const basePlural = pluralize(nat, 2);
                    const bucketPhrase = bucketToPhrase(bucket, basePlural);
                    if (bucket !== 'none') {
                        let distancePart = '';
                        if (nearState === 'near') distancePart = 'close';
                        else if (nearState === 'mid') distancePart = 'ahead';
                        else if (nearState === 'far') distancePart = 'far';

                        let dirs: string[] = [];
                        if (nearState === 'near') {
                            dirs = arr
                                .filter((o) => o.distCat === 'near' && st.idLastSeen.has(o.id) && o.dir)
                                .map((o) => o.dir as string);
                        }
                        if (dirs.length === 0) {
                            dirs = arr.filter((o) => st.idLastSeen.has(o.id) && o.dir).map((o) => o.dir as string);
                        }
                        dirs = Array.from(new Set(dirs))
                            .sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99))
                            .slice(0, MAX_DIRECTION_MENTIONS);

                        const dirPart = dirs.length ? (dirs.length === 1 ? dirs[0] : joinHuman(dirs)) : 'ahead';

                        phrase = distancePart ? `${bucketPhrase} ${distancePart} ${dirPart}` : `${bucketPhrase} ${dirPart}`;
                        phrase = postPhraseSanitize(phrase);

                        groupPhrases.push({
                            phrase,
                            nat,
                            priority,
                            total,
                            hasNear,
                            critical,
                            catCounts,
                            overrideSpoken: true,
                        });

                        const priorityLevel: SpeechPriority =
                            reason === 'nearEscalation' ? 'critical' : reason === 'bucketChange' ? 'major' : 'minor';
                        requestSpeak(phrase, priorityLevel);

                        if (bucketChanged) {
                            st.lastBucket = bucket;
                            st.lastBucketSpokenAt = now;
                        }
                        if (nearChanged) {
                            st.lastNearState = nearState;
                            st.lastNearChangeAt = now;
                        }
                    }
                } else {
                    if (nearChanged) {
                        st.lastNearState = nearState;
                        st.lastNearChangeAt = now;
                    }
                    if (bucketChanged) {
                        st.lastBucket = bucket;
                    }
                    if (hasNear && bucket !== 'one') {
                        const nearDirs = arr.filter((a) => a.distCat === 'near' && a.dir).map((a) => a.dir!) ?? [];
                        const uniqNearDirs = Array.from(new Set(nearDirs)).slice(0, 2);
                        const nearDirPhrase = uniqNearDirs.length
                            ? uniqNearDirs.length === 1
                                ? uniqNearDirs[0]
                                : joinHuman(uniqNearDirs)
                            : 'ahead';
                        phrase = `${pluralize(nat, 2)} close ${nearDirPhrase}, others ahead`;
                    }
                    phrase = postPhraseSanitize(phrase);
                    groupPhrases.push({
                        phrase,
                        nat,
                        priority,
                        total,
                        hasNear,
                        critical,
                        catCounts,
                        overrideSpoken: false,
                    });
                }
            } else {
                phrase = postPhraseSanitize(phrase);
                groupPhrases.push({
                    phrase,
                    nat,
                    priority,
                    total,
                    hasNear,
                    critical,
                    catCounts,
                });
            }
        });

        const residual = groupPhrases.filter((g) => !g.overrideSpoken);
        if (!residual.length) {
            const sig: Signature = {
                groups: groupPhrases.map((g) => ({
                    nat: g.nat,
                    priority: g.priority,
                    totalBucket: bucketCount(g.total),
                    cats: Array.from(g.catCounts.entries())
                        .filter(([c]) => c !== 'unknown')
                        .sort((a, b) => (DIST_PRIORITY[a[0]] ?? 3) - (DIST_PRIORITY[b[0]] ?? 3))
                        .map(([cat, count]) => ({ cat, count: bucketCount(count) })),
                    hasNear: g.hasNear,
                    critical: g.critical,
                })),
                hasNear: groupPhrases.some((g) => g.hasNear),
                hasCritical: groupPhrases.some((g) => g.critical),
                sumBucket: bucketCount(groupPhrases.reduce((a, g) => a + g.total, 0)),
            };
            lastSigRef.current = sig;
            return;
        }

        residual.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.total !== b.total) return b.total - a.total;
            return a.nat.localeCompare(b.nat);
        });

        const selected = residual.slice(0, MAX_GROUPS_SPOKEN);
        let finalPhrase: string;
        if (selected.length === 1) finalPhrase = selected[0].phrase;
        else {
            const parts = selected.map((g) => g.phrase);
            finalPhrase =
                parts.length === 2
                    ? `${parts[0]} and ${parts[1]}`
                    : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
        }

        const sig: Signature = {
            groups: selected.map((g) => ({
                nat: g.nat,
                priority: g.priority,
                totalBucket: bucketCount(g.total),
                cats: Array.from(g.catCounts.entries())
                    .filter(([c]) => c !== 'unknown')
                    .sort((a, b) => (DIST_PRIORITY[a[0]] ?? 3) - (DIST_PRIORITY[b[0]] ?? 3))
                    .map(([cat, count]) => ({ cat, count: bucketCount(count) })),
                hasNear: g.hasNear,
                critical: g.critical,
            })),
            hasNear: selected.some((g) => g.hasNear),
            hasCritical: selected.some((g) => g.critical),
            sumBucket: bucketCount(selected.reduce((a, g) => a + g.total, 0)),
        };

        const prevSig = lastSigRef.current;
        const changeClass = classifyChange(prevSig, sig);
        if (changeClass !== 'none') {
            requestSpeak(postPhraseSanitize(finalPhrase), changeClass);
        }
        lastSigRef.current = sig;
    }, [enabled, objects, purgeDirCache, purgeDistCache, smoothDirection, smoothDistCat, requestSpeak, getPerLabelState]);

    function buildGroupPhrase(
        arr: { nat: string; distCat?: DistCat; dir?: string | null; dm?: number; dconf?: 'high' | 'med' | 'low' }[],
        nat: string,
        total: number,
        uniformCat: boolean,
        stableCats: string[],
        catCounts: Map<string, number>
    ): string {
        if (total === 1) {
            const o = arr[0];
            const labelRaw = humanizeLabel(nat);
            const cat = o.distCat;

            const numericTail = (() => {
                if (o.dm == null || !o.dconf) return '';
                const isCritical = CRITICAL_LABELS.has(nat);
                const allowNumber = o.dconf === 'high' || (o.dconf === 'med' && isCritical);
                if (!allowNumber) return '';
                const num = o.dm < 10 ? o.dm.toFixed(1) : Math.round(o.dm).toString();
                return `, about ${num} meters`;
            })();

            if (nat === 'crosswalk') {
                const dw = cat === 'near' ? 'close' : 'ahead';
                const dir = o.dir && o.dir !== 'directly ahead' ? o.dir : '';
                return postPhraseSanitize((dir ? `crosswalk ${dir} ${dw}` : `crosswalk ${dw}`) + numericTail);
            }
            if (/(traffic light|red traffic light|yellow traffic light|green traffic light|emergency exit)/.test(labelRaw)) {
                let base = labelRaw;
                if (/(red|yellow|green) traffic light/.test(base)) {
                    base = base.replace(' traffic light', ' light');
                }
                const dw = cat === 'near' ? 'close' : 'ahead';
                const dir = o.dir && o.dir !== 'directly ahead' ? o.dir : '';
                return postPhraseSanitize((dir ? `${dir} ${base} ${dw}` : `${base} ${dw}`) + numericTail);
            }
            const distWord = cat === 'near' ? 'close' : cat === 'mid' ? 'ahead' : cat === 'far' ? 'far' : 'ahead';
            const dir = o.dir && o.dir !== 'directly ahead' ? o.dir : '';
            if (dir) return postPhraseSanitize(`${labelRaw} ${distWord} ${dir}${numericTail}`);
            return postPhraseSanitize(`${labelRaw} ${distWord}${numericTail}`);
        }

        if (uniformCat) {
            const cat = stableCats[0];
            const label = humanizeLabel(nat);
            const allDirs = arr.every((o) => o.dir);
            if (allDirs && total <= INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT) {
                const dirs = arr
                    .map((o) => o.dir!)
                    .sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99));
                const uniq: string[] = [];
                dirs.forEach((d) => {
                    if (!uniq.includes(d)) uniq.push(d);
                });
                return postPhraseSanitize(`${total} ${pluralize(label, total)} ${cat}: ${joinHuman(uniq)}`);
            }
            return postPhraseSanitize(`${total} ${pluralize(label, total)} ${cat}`);
        }

        const label = humanizeLabel(nat);
        const stableCatsList = stableCats.length > 0 ? stableCats : Array.from(catCounts.keys());

        if (total <= SMALL_GROUP_MAX) {
            const orderedCats = stableCatsList.sort((a, b) => (DIST_PRIORITY[a] ?? 3) - (DIST_PRIORITY[b] ?? 3));
            const segments: string[] = [];
            orderedCats.forEach((cat) => {
                const count = catCounts.get(cat)!;
                if (cat === 'unknown') {
                    segments.push(`${count} unknown`);
                    return;
                }
                const members = arr.filter((o) => (o.distCat || 'unknown') === (cat as DistCat));
                const dirSet = new Set<string>();
                members.forEach((m) => {
                    if (m.dir) dirSet.add(m.dir);
                });
                let seg: string;
                if (dirSet.size > 0 && dirSet.size <= 3) {
                    const dirList = Array.from(dirSet).sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99));
                    seg = count === 1 ? `${count} ${cat} ${dirList[0]}` : `${count} ${cat} ${joinHuman(dirList)}`;
                } else {
                    seg = `${count} ${cat}`;
                }
                segments.push(seg);
            });
            return postPhraseSanitize(`${total} ${pluralize(label, total)}: ${segments.join(', ')}`);
        }

        const orderedCats = stableCats.length
            ? stableCats.sort((a, b) => (DIST_PRIORITY[a] ?? 3) - (DIST_PRIORITY[b] ?? 3))
            : Array.from(catCounts.keys());
        const parts: string[] = [];
        orderedCats.forEach((cat) => {
            const c = catCounts.get(cat)!;
            if (cat === 'unknown') parts.push(`${c} unknown`);
            else parts.push(`${c} ${cat}`);
        });
        return postPhraseSanitize(`${total} ${pluralize(label, total)}: ${parts.join(', ')}`);
    }
}

export default useLiveDetectionsSpeech;