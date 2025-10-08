/* NOTE: Only showing updated version with refinements and logging as requested. */
import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { DetectionOverlay } from '@/hooks/useDetectionOverlay';
import { useDetectionsNotifier } from '@/hooks/useDetectionsNotifier';
import { mlkitObjectDetect } from '@/hooks/useMlkitObject';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { SpeechPriority, SpeechSupervisor } from '@/services/speechSupervisor';
import { initTTS, ttsSpeak, ttsStop } from '@/services/tts';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import {
    AccessibilityInfo,
    Alert,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Camera,
    useCameraPermission,
    useFrameProcessor,
} from 'react-native-vision-camera';
import * as Worklets from 'react-native-worklets-core';

/* ================= Config Flags ================= */
const SPEAK_AGGREGATE_VIA_NOTIFIER = false;
const COMPRESS_TRAFFIC_LIGHT = true;
const DUP_A11Y_SUPPRESS_MS = 900;

/* ================= Constants & Mappings ================= */

const DEFAULT_SPEECH_ON = false;

const NATURAL_LABEL_MAP: Record<string, string> = {
    stop: 'stop sign',
    stop_sign: 'stop sign',
    speed_limit: 'speed limit sign',
    'speed limit': 'speed limit sign',
    no_entry: 'no entry sign',
    'no entry': 'no entry sign',
    hazard: 'hazard sign',
    crosswalk: 'crosswalk',
    bike: 'bicycle',
    bicycle: 'bicycle',
    car: 'car',
    van: 'van',
    truck: 'truck',
    motorcycle: 'motorcycle',
    'traffic red': 'red traffic light',
    'traffic yellow': 'yellow traffic light',
    'traffic green': 'green traffic light',
    emergency_exit: 'emergency exit',
    'emergency exit': 'emergency exit',
};

const DIST_PRIORITY: Record<string, number> = { near: 0, mid: 1, far: 2, unknown: 3 };
const DIRECTION_ORDER: Record<string, number> = {
    'upper left': 0,
    'upper right': 1,
    'left': 2,
    'directly ahead': 3,
    'right': 4,
    'lower left': 5,
    'lower right': 6,
};

const DIR_STABLE_FRAMES = 3;
const DIR_NULL_GRACE = 2;
const DIR_CACHE_TTL_MS = 9000;

const SMALL_GROUP_MAX = 4;
const INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT = 3;
const MAX_GROUPS_SPOKEN = 3;

const SPEECH_INTERRUPT_GRACE_MS = 1600;
const MIN_MAJOR_INTERVAL_MS = 2800;
const MIN_MINOR_INTERVAL_MS = 4200;

const CRITICAL_LABELS = new Set([
    'stop sign',
    'hazard sign',
    'crosswalk',
    'emergency exit',
    'red traffic light',
]);

const MULTI_COUNT_LABELS = new Set([
    'car', 'truck', 'van', 'bicycle', 'motorcycle'
]);

const ID_ABSENCE_MS = 900;
const MIN_BUCKET_SPEAK_INTERVAL_MS = 2500;
const NEAR_DEESC_DELAY_MS = 1500;
const MAX_DIRECTION_MENTIONS = 2;

/* Helpers */

function bucketCount(n: number): number {
    if (n <= 2) return n;
    if (n <= 4) return 3;
    return 5;
}
function naturalLabel(base?: string) {
    if (!base) return 'object';
    return NATURAL_LABEL_MAP[base] || base.replace(/_/g, ' ');
}
function humanizeLabel(label: string) {
    return NATURAL_LABEL_MAP[label] || label.replace(/_/g, ' ');
}
function pluralize(label: string, n: number) {
    if (n === 1) return label;
    if (label.endsWith('y') && !label.endsWith('ay') && !label.endsWith('ey')) return label.slice(0, -1) + 'ies';
    if (label.endsWith('s')) return label;
    return label + 's';
}
function joinHuman(list: string[]): string {
    if (list.length <= 1) return list[0] ?? '';
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}
function directionDescriptor(xc: number, yc: number): string | null {
    const col = xc < 1 / 3 ? 0 : xc < 2 / 3 ? 1 : 2;
    const row = yc < 1 / 3 ? 0 : yc < 2 / 3 ? 1 : 2;
    if (row === 0) {
        if (col === 0) return 'upper left';
        if (col === 2) return 'upper right';
        return null;
    }
    if (row === 1) {
        if (col === 0) return 'left';
        if (col === 1) return 'directly ahead';
        if (col === 2) return 'right';
    } else {
        if (col === 0) return 'lower left';
        if (col === 2) return 'lower right';
        return null;
    }
    return null;
}
function estimateSpeechDurationMs(phrase: string) {
    const words = phrase.trim().split(/\s+/).filter(Boolean).length;
    return 500 + words * 350;
}
function mapCountToSemanticBucket(n: number): 'none' | 'one' | 'few' | 'several' {
    if (n <= 0) return 'none';
    if (n === 1) return 'one';
    if (n <= 3) return 'few';
    return 'several';
}
function bucketToPhrase(bucket: string, baseLabelPlural: string) {
    switch (bucket) {
        case 'none': return '';
        case 'one': return `one ${baseLabelPlural.replace(/s$/, '')}`;
        case 'few': return `a few ${baseLabelPlural}`;
        case 'several': return `several ${baseLabelPlural}`;
        default: return baseLabelPlural;
    }
}
function postPhraseSanitize(p: string) {
    return p
        .replace(/\b(ahead)\s+\1\b/gi, '$1')
        .replace(/\b(directly ahead)\s+ahead\b/gi, 'directly ahead')
        .replace(/\b(close ahead)\b/gi, 'close')
        .replace(/\bnear distance\b/gi, 'near')
        .replace(/\s+/g, ' ')
        .trim();
}

/* Signatures */

type CatSeg = { cat: string; count: number };
type GroupSig = {
    nat: string;
    priority: number;
    totalBucket: number;
    cats: CatSeg[];
    hasNear: boolean;
    critical: boolean;
};
type Signature = {
    groups: GroupSig[];
    hasNear: boolean;
    hasCritical: boolean;
    sumBucket: number;
};

function classifyChange(prev: Signature | null, curr: Signature): 'critical' | 'major' | 'minor' | 'none' {
    if (!prev) return 'critical';
    const criticalFlip = prev.hasCritical !== curr.hasCritical;
    if (criticalFlip) return 'critical';
    const nearGain = !prev.hasNear && curr.hasNear;
    if (nearGain) return 'critical';
    const totalJump = Math.abs(curr.sumBucket - prev.sumBucket) >= 2;
    if (totalJump && curr.hasNear) return 'critical';
    const prevMap = new Map(prev.groups.map(g => [g.nat, g]));
    const currMap = new Map(curr.groups.map(g => [g.nat, g]));
    for (const g of curr.groups) {
        if (g.critical && !prevMap.has(g.nat)) return 'critical';
    }
    let major = false;
    for (const g of curr.groups) {
        const pg = prevMap.get(g.nat);
        if (!pg) {
            major = major || g.hasNear;
            continue;
        }
        if (pg.priority !== g.priority) {
            if (g.priority < pg.priority) return 'critical';
            major = true;
        }
        if (pg.hasNear !== g.hasNear) major = true;
        if (pg.totalBucket !== g.totalBucket) major = major || g.hasNear;
        const prevCatsKey = pg.cats.map(c => `${c.cat}:${c.count}`).join('|');
        const currCatsKey = g.cats.map(c => `${c.cat}:${c.count}`).join('|');
        if (prevCatsKey !== currCatsKey) major = true;
    }
    for (const pg of prev.groups) {
        if (!currMap.has(pg.nat)) {
            major = major || pg.hasNear || pg.critical;
        }
    }
    if (major) return 'major';
    if (JSON.stringify(prev) === JSON.stringify(curr)) return 'none';
    return 'minor';
}

/* ================= Components ================= */

const PermissionsPage = () => (
    <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="Camera permission required">
        <ThemedText style={styles.permissionText}>Camera permission is required.</ThemedText>
        <Buttons
            title="Open Settings"
            onPress={() =>
                Linking.openSettings().catch(() =>
                    Alert.alert('Unable to open settings')
                )
            }
            accessibilityLabel="Open system settings to grant camera permission"
            containerStyle={{ marginTop: 24 }}
        />
    </ThemedView>
);

const NoCameraDeviceError = () => {
    React.useEffect(() => {
        AccessibilityInfo.announceForAccessibility('No camera device found.');
    }, []);
    return (
        <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="No camera device found">
            <ThemedText style={styles.permissionText}>No camera device found.</ThemedText>
        </ThemedView>
    );
};

/* ================= Main Screen ================= */

export default function Index() {
    React.useEffect(() => {
        let cleanup: undefined | (() => void);
        initTTS()
            .then(res => { cleanup = res.cleanup; })
            .catch(e => console.warn('[TTS] init failed:', e));
        return () => { try { cleanup?.(); } catch { } };
    }, []);

    const [screenReaderOn, setScreenReaderOn] = React.useState(false);
    React.useEffect(() => {
        AccessibilityInfo.isScreenReaderEnabled()
            .then(enabled => setScreenReaderOn(!!enabled))
            .catch(() => { });
        const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled: boolean) => {
            setScreenReaderOn(!!enabled);
        });
        return () => {
            // @ts-ignore
            sub?.remove?.();
        };
    }, []);

    const [cameraPosition, setCameraPosition] = React.useState<'front' | 'back'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [speechOn, setSpeechOn] = React.useState(DEFAULT_SPEECH_ON);
    const [isActive, setIsActive] = React.useState(true);

    const [objects, setObjects] = React.useState<any[]>([]);
    const [frameDims, setFrameDims] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [fpError, setFpError] = React.useState<string | null>(null);
    const [previewSize, setPreviewSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    const [showOverlay, setShowOverlay] = React.useState(true);
    const [lastDetTs, setLastDetTs] = React.useState(0);

    const detectionStatus: 'ok' | 'warm' | 'off' = React.useMemo(() => {
        if (!isActive) return 'off';
        if (fpError) return 'off';
        return (Date.now() - lastDetTs) < 2000 ? 'ok' : 'warm';
    }, [isActive, fpError, lastDetTs]);

    const firstSpeechActivationRef = React.useRef(true);

    const { hasPermission, requestPermission } = useCameraPermission();
    const navigation = useNavigation<DrawerNavigationProp<any>>();
    const colorScheme = useColorScheme() ?? 'light';
    const themeColors = Colors[colorScheme];
    const { device, format, fps, supportsTorch } = useSimpleFormat(cameraPosition);

    React.useEffect(() => {
        if (format) {
            console.log('Camera format:', {
                videoWidth: format.videoWidth,
                videoHeight: format.videoHeight,
                minFps: format.minFps,
                maxFps: format.maxFps,
            });
        }
        console.log('Camera FPS:', fps);
    }, [format, fps]);

    // Plugin bridging
    const setPluginResultOnJS = Worklets.useRunOnJS((raw: any) => {
        if (!raw || typeof raw.detSeq !== 'number') return;
        if (raw.detSeq > 0) setLastDetTs(Date.now());
        setFpError(null);
        const objs = Array.isArray(raw.objs) ? raw.objs : [];
        setObjects(objs);
        setFrameDims({
            width: typeof raw.width === 'number' ? raw.width : 0,
            height: typeof raw.height === 'number' ? raw.height : 0,
        });
    }, []);
    const setPluginErrorOnJS = Worklets.useRunOnJS((msg: string) => {
        setFpError(msg);
    }, []);

    const frameProcessor = useFrameProcessor((frame) => {
        'worklet';
        try {
            const result = mlkitObjectDetect(frame) as any;
            if (result && typeof result.detSeq === 'number') {
                setPluginResultOnJS(result);
            } else {
                setPluginErrorOnJS('Plugin result missing detSeq');
            }
        } catch (e: any) {
            setPluginErrorOnJS(String(e?.message ?? 'plugin call failed'));
        }
    }, [setPluginResultOnJS, setPluginErrorOnJS]);

    React.useEffect(() => {
        if (!hasPermission) {
            requestPermission().catch(() => { });
        }
    }, [hasPermission, requestPermission]);

    const announce = (msg: string) => {
        if (speechOn) AccessibilityInfo.announceForAccessibility(msg);
    };

    React.useEffect(() => {
        if (!speechOn || !isActive) {
            ttsStop().catch(() => { });
            speechSupervisorRef.current?.notifyStopped();
        }
    }, [speechOn, isActive]);

    const notifyDetections = useDetectionsNotifier({
        enabled: speechOn && isActive && detectionStatus === 'ok',
        useTTS: false,
        stableFrames: 3,
        minConfidence: 0.5,
        perObjectCooldownMs: 5000,
        globalCooldownMs: 400,
        includeConfidenceInMessage: false,
        summarizeMultiple: false,
        allowUnlabeled: false,
        numbering: false,
        numberFormat: 'words',
        numberingResetMs: 6000,
        labelHoldMs: 2500,
        minScoreDeltaToSwitch: 0.12,
        iouThresholdForCluster: 0.2,
        labelMap: {},
        speakTTS: (text: string) => ttsSpeak(text),
        announceA11y: (msg: string) => AccessibilityInfo.announceForAccessibility(msg),
    });

    /* Speech Supervisor & Logging */

    const lastA11yRef = React.useRef<{ phrase: string; ts: number }>({ phrase: '', ts: 0 });
    const speechSupervisorRef = React.useRef<SpeechSupervisor | null>(null);
    if (!speechSupervisorRef.current) {
        speechSupervisorRef.current = new SpeechSupervisor({
            estimateMs: estimateSpeechDurationMs,
            interruptGraceMs: SPEECH_INTERRUPT_GRACE_MS,
            minMajorIntervalMs: MIN_MAJOR_INTERVAL_MS,
            minMinorIntervalMs: MIN_MINOR_INTERVAL_MS,
            fallbackTimer: true,
            onSpeak: (rawPhrase, utteranceId, priority) => {
                const clean = postPhraseSanitize(rawPhrase);
                const iso = new Date().toISOString();
                console.log(`[Speech] ${iso} priority=${priority} id=${utteranceId} phrase="${clean}"`);
                ttsSpeak(clean, {
                    utteranceId,
                    onDone: (id) => speechSupervisorRef.current?.notifyDone(id),
                    onError: (id) => speechSupervisorRef.current?.notifyDone(id)
                }).catch(() => {
                    speechSupervisorRef.current?.notifyDone(utteranceId);
                });

                if (SPEAK_AGGREGATE_VIA_NOTIFIER) {
                    notifyDetections([{
                        id: 'speech:aggregate',
                        label: clean,
                        score: 0.99,
                    }]);
                } else {
                    // Deduplicate rapid identical accessibility announcements
                    const now = Date.now();
                    if (lastA11yRef.current.phrase === clean && (now - lastA11yRef.current.ts) < DUP_A11Y_SUPPRESS_MS) {
                        console.log(`[SpeechSkipDup] suppressed a11y repeat phrase="${clean}"`);
                    } else {
                        AccessibilityInfo.announceForAccessibility(clean);
                        lastA11yRef.current = { phrase: clean, ts: now };
                    }
                }
            }
        });
    }

    /* Direction smoothing cache */
    type DirCache = { stable: string | null; current: string | null; count: number; nullHold: number; lastSeen: number };
    const directionCacheRef = React.useRef<Map<number, DirCache>>(new Map());

    function smoothDirection(id: number, rawDir: string | null, now: number): string | null {
        if (id < 0) return rawDir;
        const cache = directionCacheRef.current;
        let entry = cache.get(id);
        if (!entry) {
            entry = { stable: rawDir, current: rawDir, count: 1, nullHold: rawDir ? 0 : 1, lastSeen: now };
            cache.set(id, entry);
            return rawDir;
        }
        entry.lastSeen = now;
        if (rawDir === entry.current) {
            entry.count += 1;
        } else {
            entry.current = rawDir;
            entry.count = 1;
        }
        if (rawDir == null) {
            if (entry.stable) {
                entry.nullHold += 1;
                if (entry.nullHold > DIR_NULL_GRACE) entry.stable = null;
            }
        } else {
            entry.nullHold = 0;
            if (entry.count >= DIR_STABLE_FRAMES) entry.stable = rawDir;
        }
        return entry.stable ?? rawDir;
    }
    function purgeDirCache(now: number) {
        for (const [id, v] of Array.from(directionCacheRef.current.entries())) {
            if (now - v.lastSeen > DIR_CACHE_TTL_MS) directionCacheRef.current.delete(id);
        }
    }

    const lastSigRef = React.useRef<Signature | null>(null);

    interface PerLabelState {
        lastBucket: string | null;
        lastBucketSpokenAt: number;
        lastNearState: 'none' | 'near' | 'mid' | 'far' | null;
        lastNearChangeAt: number;
        idLastSeen: Map<number, number>;
    }
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
        if (!speechOn || detectionStatus !== 'ok') return;
        const rawList = (objects ?? []) as any[];
        const now = Date.now();
        purgeDirCache(now);
        if (!rawList.length) return;

        type Info = {
            id: number;
            nat: string;
            distCat?: string;
            score?: number;
            dir?: string | null;
            dm?: number;
            dconf?: 'high' | 'med' | 'low';
        };

        const infos: Info[] = rawList.map(o => {
            const top = (Array.isArray(o.labels) && o.labels.length > 0) ? o.labels[0] : null;
            const base = top?.name as string | undefined;
            const distStable = (typeof o.distance_cat === 'string'
                && o.distance_cat !== 'unknown'
                && o.distance_cat_conf === 'stable') ? o.distance_cat as string : undefined;

            const b = Array.isArray(o.b) ? o.b : [];
            let xc: number | undefined, yc: number | undefined;
            if (b.length === 4) {
                const [x, y, w, h] = b as [number, number, number, number];
                xc = x + w / 2; yc = y + h / 2;
            }
            const rawDir = (xc != null && yc != null) ? directionDescriptor(xc, yc) : null;
            const dm = (typeof o.distance_m === 'number' && o.distance_m > 0) ? o.distance_m as number : undefined
            const dconf = (typeof o.distance_conf === 'string') ? (o.distance_conf as 'high' | 'med' | 'low') : undefined
            return {
                id: o.id ?? -1,
                nat: naturalLabel(base),
                distCat: distStable,
                score: typeof top?.c === 'number' ? top.c : undefined,
                dir: smoothDirection(o.id ?? -1, rawDir, now),
                dm,
                dconf
            };
        }).filter(i => i.nat);

        if (!infos.length) return;

        const groupsMap = new Map<string, Info[]>();
        infos.forEach(i => {
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
            arr.forEach(i => {
                const c = i.distCat || 'unknown';
                catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
            });
            const stableCats = Array.from(catCounts.keys()).filter(c => c !== 'unknown');
            const priority = stableCats.length
                ? Math.min(...stableCats.map(c => DIST_PRIORITY[c] ?? 3))
                : 3;
            const total = arr.length;
            const uniformCat = (stableCats.length === 1 && catCounts.get(stableCats[0]) === total);
            let phrase = buildGroupPhrase(arr, nat, total, uniformCat, stableCats, catCounts);
            const hasNear = (catCounts.get('near') ?? 0) > 0;
            const critical = CRITICAL_LABELS.has(nat);

            if (MULTI_COUNT_LABELS.has(nat)) {
                const st = getPerLabelState(nat);
                arr.forEach(o => {
                    if (o.id && o.id !== -1) st.idLastSeen.set(o.id, now);
                });
                for (const [id, ts] of Array.from(st.idLastSeen.entries())) {
                    if (now - ts > ID_ABSENCE_MS) st.idLastSeen.delete(id);
                }
                const stableCount = st.idLastSeen.size;
                const bucket = mapCountToSemanticBucket(stableCount);

                let minCat: string = 'unknown';
                let minVal = 99;
                arr.forEach(a => {
                    if (!st.idLastSeen.has(a.id)) return;
                    const dc = (a.distCat || 'unknown');
                    const p = DIST_PRIORITY[dc] ?? 99;
                    if (p < minVal) { minVal = p; minCat = dc; }
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
                    shouldSpeak = true; reason = 'nearEscalation';
                } else if (bucketChanged && bucket !== 'none' && nowSinceBucket >= MIN_BUCKET_SPEAK_INTERVAL_MS) {
                    shouldSpeak = true; reason = 'bucketChange';
                } else if (nearChanged && (nearState === 'mid' || nearState === 'far')) {
                    if (nowSinceNearChange >= NEAR_DEESC_DELAY_MS) {
                        shouldSpeak = true; reason = 'nearRetreat';
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
                            dirs = arr.filter(o => o.distCat === 'near' && st.idLastSeen.has(o.id) && o.dir)
                                .map(o => o.dir as string);
                        }
                        if (dirs.length === 0) {
                            dirs = arr.filter(o => st.idLastSeen.has(o.id) && o.dir).map(o => o.dir as string);
                        }
                        dirs = Array.from(new Set(dirs))
                            .sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99))
                            .slice(0, MAX_DIRECTION_MENTIONS);

                        const dirPart = dirs.length
                            ? (dirs.length === 1 ? dirs[0] : joinHuman(dirs))
                            : 'ahead';

                        phrase = distancePart
                            ? `${bucketPhrase} ${distancePart} ${dirPart}`
                            : `${bucketPhrase} ${dirPart}`;
                        phrase = postPhraseSanitize(phrase);

                        groupPhrases.push({
                            phrase,
                            nat,
                            priority,
                            total,
                            hasNear,
                            critical,
                            catCounts,
                            overrideSpoken: true
                        });

                        const priorityLevel: SpeechPriority =
                            reason === 'nearEscalation' ? 'critical'
                                : reason === 'bucketChange' ? 'major'
                                    : 'minor';
                        speechSupervisorRef.current?.requestSpeak(phrase, priorityLevel);

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
                        const nearDirs = arr.filter(a => a.distCat === 'near' && a.dir).map(a => a.dir!) ?? [];
                        const uniqNearDirs = Array.from(new Set(nearDirs)).slice(0, 2);
                        const nearDirPhrase = uniqNearDirs.length
                            ? uniqNearDirs.length === 1 ? uniqNearDirs[0] : joinHuman(uniqNearDirs)
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
                        overrideSpoken: false
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
                    catCounts
                });
            }
        });

        const residual = groupPhrases.filter(g => !g.overrideSpoken);
        if (!residual.length) {
            const sig: Signature = {
                groups: groupPhrases.map(g => ({
                    nat: g.nat,
                    priority: g.priority,
                    totalBucket: bucketCount(g.total),
                    cats: Array
                        .from(g.catCounts.entries())
                        .filter(([c]) => c !== 'unknown')
                        .sort((a, b) => (DIST_PRIORITY[a[0]] ?? 3) - (DIST_PRIORITY[b[0]] ?? 3))
                        .map(([cat, count]) => ({ cat, count: bucketCount(count) })),
                    hasNear: g.hasNear,
                    critical: g.critical
                })),
                hasNear: groupPhrases.some(g => g.hasNear),
                hasCritical: groupPhrases.some(g => g.critical),
                sumBucket: bucketCount(groupPhrases.reduce((a, g) => a + g.total, 0))
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
            const parts = selected.map(g => g.phrase);
            finalPhrase = parts.length === 2
                ? `${parts[0]} and ${parts[1]}`
                : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
        }

        const sig: Signature = {
            groups: selected.map(g => ({
                nat: g.nat,
                priority: g.priority,
                totalBucket: bucketCount(g.total),
                cats: Array
                    .from(g.catCounts.entries())
                    .filter(([c]) => c !== 'unknown')
                    .sort((a, b) => (DIST_PRIORITY[a[0]] ?? 3) - (DIST_PRIORITY[b[0]] ?? 3))
                    .map(([cat, count]) => ({ cat, count: bucketCount(count) })),
                hasNear: g.hasNear,
                critical: g.critical
            })),
            hasNear: selected.some(g => g.hasNear),
            hasCritical: selected.some(g => g.critical),
            sumBucket: bucketCount(selected.reduce((a, g) => a + g.total, 0))
        };

        const prevSig = lastSigRef.current;
        const changeClass = classifyChange(prevSig, sig);
        if (changeClass !== 'none') {
            speechSupervisorRef.current?.requestSpeak(postPhraseSanitize(finalPhrase), changeClass);
        }
        lastSigRef.current = sig;
    }, [objects, speechOn, detectionStatus, notifyDetections, getPerLabelState]);

    function buildGroupPhrase(
        arr: { nat: string; distCat?: string; dir?: string | null; dm?: number; dconf?: 'high' | 'med' | 'low' }[],
        nat: string,
        total: number,
        uniformCat: boolean,
        stableCats: string[],
        catCounts: Map<string, number>
    ): string {
        // Single object
        if (total === 1) {
            const o = arr[0];
            const labelRaw = humanizeLabel(nat);
            const cat = o.distCat;

            // Add numeric distance if confidence allows
            const numericTail = (() => {
                if (o.dm == null || !o.dconf) return '';
                const isCritical = CRITICAL_LABELS.has(nat);
                const allowNumber = o.dconf === 'high' || (o.dconf === 'med' && isCritical);
                if (!allowNumber) return '';
                const num = o.dm < 10 ? o.dm.toFixed(1) : Math.round(o.dm).toString();
                return `, about ${num} meters`;
            })();

            // Crosswalk
            if (nat === 'crosswalk') {
                const dw = cat === 'near' ? 'close' : 'ahead';
                const dir = (o.dir && o.dir !== 'directly ahead') ? o.dir : '';
                return postPhraseSanitize((dir ? `crosswalk ${dir} ${dw}` : `crosswalk ${dw}`) + numericTail);
            }
            // Traffic lights & emergency exit
            if (/(traffic light|red traffic light|yellow traffic light|green traffic light|emergency exit)/.test(labelRaw)) {
                // compress "red traffic light" -> "red light" if compression enabled
                let base = labelRaw;
                if (COMPRESS_TRAFFIC_LIGHT && /(red|yellow|green) traffic light/.test(base)) {
                    base = base.replace(' traffic light', ' light');
                }
                const dw = cat === 'near' ? 'close' : 'ahead';
                const dir = (o.dir && o.dir !== 'directly ahead') ? o.dir : '';
                return postPhraseSanitize((dir ? `${dir} ${base} ${dw}` : `${base} ${dw}`) + numericTail);
            }
            // Generic mapping
            const distWord =
                cat === 'near' ? 'close'
                    : cat === 'mid' ? 'ahead'
                        : cat === 'far' ? 'far'
                            : 'ahead';
            const dir = (o.dir && o.dir !== 'directly ahead') ? o.dir : '';
            if (dir) return postPhraseSanitize(`${labelRaw} ${distWord} ${dir}${numericTail}`);
            return postPhraseSanitize(`${labelRaw} ${distWord}${numericTail}`);
        }

        // Uniform single distance category group
        if (uniformCat) {
            const cat = stableCats[0];
            const label = humanizeLabel(nat);
            const allDirs = arr.every(o => o.dir);
            if (allDirs && total <= INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT) {
                const dirs = arr
                    .map(o => o.dir!)
                    .sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99));
                const uniq: string[] = [];
                dirs.forEach(d => { if (!uniq.includes(d)) uniq.push(d); });
                return postPhraseSanitize(`${total} ${pluralize(label, total)} ${cat}: ${joinHuman(uniq)}`);
            }
            return postPhraseSanitize(`${total} ${pluralize(label, total)} ${cat}`);
        }

        const label = humanizeLabel(nat);
        const stableCatsList = stableCats.length > 0 ? stableCats : Array.from(catCounts.keys());

        if (total <= SMALL_GROUP_MAX) {
            const orderedCats = stableCatsList.sort((a, b) => (DIST_PRIORITY[a] ?? 3) - (DIST_PRIORITY[b] ?? 3));
            const segments: string[] = [];
            orderedCats.forEach(cat => {
                const count = catCounts.get(cat)!;
                if (cat === 'unknown') {
                    segments.push(`${count} unknown`);
                    return;
                }
                const members = arr.filter(o => (o.distCat || 'unknown') === cat);
                const dirSet = new Set<string>();
                members.forEach(m => { if (m.dir) dirSet.add(m.dir); });
                let seg: string;
                if (dirSet.size > 0 && dirSet.size <= 3) {
                    const dirList = Array.from(dirSet).sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99));
                    seg = count === 1
                        ? `${count} ${cat} ${dirList[0]}`
                        : `${count} ${cat} ${joinHuman(dirList)}`;
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
        orderedCats.forEach(cat => {
            const c = catCounts.get(cat)!;
            if (cat === 'unknown') parts.push(`${c} unknown`);
            else parts.push(`${c} ${cat}`);
        });
        return postPhraseSanitize(`${total} ${pluralize(label, total)}: ${parts.join(', ')}`);
    }

    if (!hasPermission) return <PermissionsPage />;
    if (!device) return <NoCameraDeviceError />;

    const toggleActive = () => {
        setIsActive(prev => {
            const next = !prev;
            if (!next && torch === 'on') {
                setTorch('off');
                announce('Torch off');
            }
            announce(next ? 'Live view resumed' : 'Live view paused');
            return next;
        });
    };
    const toggleTorch = () => {
        if (!supportsTorch) {
            announce('Torch not available on this camera');
            return;
        }
        if (!isActive) {
            announce('Cannot toggle torch while live view is paused');
            return;
        }
        setTorch(t => {
            const next = t === 'off' ? 'on' : 'off';
            announce(next === 'on' ? 'Torch on' : 'Torch off');
            return next;
        });
    };
    const toggleSpeech = () => {
        setSpeechOn(prev => {
            const next = !prev;
            if (next) {
                if (!screenReaderOn) {
                    if (firstSpeechActivationRef.current) {
                        firstSpeechActivationRef.current = false;
                        ttsSpeak('Speech feature enabled.').catch(() => { });
                    } else {
                        ttsSpeak('Speech on.').catch(() => { });
                    }
                } else {
                    AccessibilityInfo.announceForAccessibility('Speech on');
                }
            } else {
                ttsStop().catch(() => { });
                speechSupervisorRef.current?.notifyStopped();
                AccessibilityInfo.announceForAccessibility('Speech off');
            }
            return next;
        });
    };
    const toggleCameraPosition = () => {
        setCameraPosition(p => {
            const next = p === 'back' ? 'front' : 'back';
            announce(next === 'front' ? 'Front camera active' : 'Rear camera active');
            if (torch === 'on' && device?.hasTorch === false) {
                setTorch('off');
            }
            return next;
        });
    };

    const statusColor = detectionStatus === 'ok' ? '#9cff9c' : detectionStatus === 'warm' ? '#ffd27a' : '#ff9c9c';
    const statusText = detectionStatus === 'ok' ? 'Detection: OK' : detectionStatus === 'warm' ? 'Detection: Warming…' : 'Detection: Off';
    const objCount = objects?.length ?? 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} accessible={false}>
            <TouchableOpacity
                style={styles.drawerToggle}
                onPress={() => navigation.toggleDrawer()}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Open navigation drawer"
            >
                <Ionicons name="menu" size={32} color={themeColors.text} />
            </TouchableOpacity>

            <View
                style={styles.previewWrapper}
                accessible
                accessibilityLabel={`Live camera preview ${isActive ? 'running' : 'paused'}`}
                accessibilityHint="Use the center button below to pause or resume."
                onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    setPreviewSize({ width, height });
                }}
            >
                <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 12, flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                        onPress={() => setShowOverlay(v => !v)}
                        style={{ backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: showOverlay }}
                        accessibilityLabel="Toggle detection overlay"
                    >
                        <Text style={{ color: '#fff', fontSize: 12 }}>{showOverlay ? 'Overlay: On' : 'Overlay: Off'}</Text>
                    </TouchableOpacity>
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}>
                        <Text style={{ color: statusColor, fontSize: 12 }}>{statusText}</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 12 }}>Objs: {objCount}</Text>
                    </View>
                </View>

                <Camera
                    style={{ flex: 1 }}
                    device={device}
                    isActive={isActive}
                    resizeMode="cover"
                    torch={torch}
                    pixelFormat="yuv"
                    {...(format ? { format } : {})}
                    {...(format && fps ? { fps } : {})}
                    frameProcessor={frameProcessor}
                />
                {showOverlay && detectionStatus === 'ok' && (
                    <DetectionOverlay
                        containerWidth={previewSize.width}
                        containerHeight={previewSize.height}
                        frameWidth={frameDims.width}
                        frameHeight={frameDims.height}
                        objects={objects as any}
                    />
                )}
                {fpError ? (
                    <View style={{ position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(255,0,0,0.35)', padding: 6, borderRadius: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 12 }}>Detection error: {fpError}</Text>
                    </View>
                ) : null}
            </View>

            <View style={styles.upperRow} accessible accessibilityLabel="Camera controls row">
                <Buttons
                    iconName={
                        supportsTorch
                            ? (torch === 'on' ? 'flashlight' : 'flashlight-outline')
                            : 'flash-off-outline'
                    }
                    onPress={toggleTorch}
                    accessibilityLabel={
                        supportsTorch
                            ? (torch === 'on' ? 'Turn torch off' : 'Turn torch on')
                            : 'Torch unavailable'
                    }
                    accessibilityState={{
                        disabled: !isActive || !supportsTorch,
                        checked: supportsTorch ? torch === 'on' : undefined,
                    }}
                    disabled={!isActive || !supportsTorch}
                    containerStyle={{ alignSelf: 'center' }}
                />
                <Buttons
                    iconName="camera-reverse-outline"
                    onPress={toggleCameraPosition}
                    accessibilityLabel="Switch camera"
                    accessibilityHint={`Currently ${cameraPosition === 'back' ? 'rear' : 'front'} camera active`}
                    accessibilityState={{ disabled: false }}
                    containerStyle={{ alignSelf: 'center' }}
                />
            </View>

            <View style={styles.lowerRow}>
                <Buttons
                    iconName={speechOn ? 'volume-high-outline' : 'volume-mute-outline'}
                    onPress={toggleSpeech}
                    accessibilityLabel={speechOn ? 'Turn speech off' : 'Turn speech on'}
                    accessibilityState={{ checked: speechOn }}
                    containerStyle={{ alignSelf: 'center' }}
                    iconSize={40}
                />
                <Buttons
                    title={isActive ? 'Pause' : 'Resume'}
                    onPress={toggleActive}
                    accessibilityLabel={isActive ? 'Pause live view' : 'Resume live view'}
                    accessibilityState={{ checked: isActive }}
                    accessibilityHint="Toggles live camera feed."
                    circular
                    size="xl"
                    variant={isActive ? 'danger' : 'primary'}
                    containerStyle={{ alignSelf: 'center' }}
                />
                <Buttons
                    iconName="language-outline"
                    onPress={() => announce('Language selection feature coming soon')}
                    accessibilityLabel="Language selection (coming soon)"
                    containerStyle={{ alignSelf: 'center', opacity: 0.5 }}
                    iconSize={40}
                    accessibilityState={{ disabled: true }}
                    disabled
                />
            </View>
        </SafeAreaView>
    );
}

/* ================= Styles ================= */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 60 : 0,
    },
    drawerToggle: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 40 : 10,
        right: 10,
        zIndex: 10,
        padding: 8,
        borderRadius: 20,
    },
    previewWrapper: {
        flex: 2,
        borderRadius: 10,
        overflow: 'hidden',
        marginHorizontal: 12,
    },
    upperRow: {
        flex: 0.4,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
    },
    lowerRow: {
        flex: 0.5,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        padding: 32,
    },
    permissionText: {
        fontSize: 20,
        fontFamily: 'AtkinsonBold',
        textAlign: 'center',
    },
});