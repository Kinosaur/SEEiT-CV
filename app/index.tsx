/* --- imports unchanged except new SpeechSupervisor --- */
import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { DetectionOverlay } from '@/hooks/useDetectionOverlay';
import { useDetectionsNotifier } from '@/hooks/useDetectionsNotifier';
import { mlkitObjectDetect } from '@/hooks/useMlkitObject';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { SpeechSupervisor } from '@/services/speechSupervisor'; // NEW
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

/* Existing constants (kept) ... only minor additions at bottom for critical labels */

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
    'traffic red': 'red traffic light',
    'traffic yellow': 'yellow traffic light',
    'traffic green': 'green traffic light',
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

/* New gating constants replacing earlier attempt */
const SPEECH_INTERRUPT_GRACE_MS = 1600;     // Critical interrupt grace
const MIN_MAJOR_INTERVAL_MS = 2800;
const MIN_MINOR_INTERVAL_MS = 4200;

/* Critical labels drive interrupts/priorities */
const CRITICAL_LABELS = new Set([
    'stop sign',
    'hazard sign',
    'crosswalk',
    'emergency exit',
    'red traffic light',
]);

/* Minor: count bucketing to suppress small +/- flicker */
function bucketCount(n: number): number {
    if (n <= 2) return n;      // 1,2 explicit
    if (n <= 4) return 3;      // 3-4 bucket
    return 5;                  // 5+ bucket (your cap is 5 anyway)
}

function naturalLabel(base?: string) {
    if (!base) return 'object';
    return NATURAL_LABEL_MAP[base] || base;
}
function pluralize(label: string, n: number) {
    if (n === 1) return label;
    if (label.endsWith('y') && !label.endsWith('ay') && !label.endsWith('ey')) return label.slice(0, -1) + 'ies';
    if (label.endsWith('s')) return label;
    return label + 's';
}
function article(label: string) {
    const first = label.trim()[0]?.toLowerCase();
    return 'aeiou'.includes(first) ? 'an' : 'a';
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

/* Duration estimation slightly higher to reduce premature “available” */
function estimateSpeechDurationMs(phrase: string) {
    const words = phrase.trim().split(/\s+/).filter(Boolean).length;
    const basePerWord = 350; // slower, safer
    return 500 + words * basePerWord;
}

/* PERMISSIONS & components unchanged (omitted for brevity; keep yours) */

const PermissionsPage = () => (
    <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="Camera permission required">
        <ThemedText style={styles.permissionText}>Camera permission is required.</ThemedText>
        <Buttons
            title="Open Settings"
            onPress={() => Linking.openSettings().catch(() => Alert.alert('Unable to open settings'))}
            accessibilityLabel="Open system settings to grant camera permission"
            containerStyle={{ marginTop: 24 }}
        />
    </ThemedView>
);

const NoCameraDeviceError = () => {
    React.useEffect(() => { AccessibilityInfo.announceForAccessibility('No camera device found.'); }, []);
    return (
        <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="No camera device found">
            <ThemedText style={styles.permissionText}>No camera device found.</ThemedText>
        </ThemedView>
    );
};

export default function Index() {
    /* (All your existing React state & effects retained, only modifications inside speech section) */

    React.useEffect(() => {
        let cleanup: undefined | (() => void);
        initTTS()
            .then((res) => { cleanup = res.cleanup; })
            .catch((e) => console.warn('[TTS] init failed:', e));
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
        return () => { // @ts-ignore
            sub?.remove?.();
        };
    }, []);

    const [cameraPosition, setCameraPosition] = React.useState<'front' | 'back'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [speechOn, setSpeechOn] = React.useState(DEFAULT_SPEECH_ON);
    const [isActive, setIsActive] = React.useState(true);
    const [objects, setObjects] = React.useState<any[]>([]);
    const [frameDims, setFrameDims] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [topInfo, setTopInfo] = React.useState<{ label: string; confidence: number }>({ label: '', confidence: -1 });
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
                videoWidth: format.videoWidth, videoHeight: format.videoHeight,
                minFps: format.minFps, maxFps: format.maxFps,
            });
        }
        console.log('Camera FPS:', fps);
    }, [format, fps]);

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
        setTopInfo({
            label: typeof raw.topLabel === 'string' ? raw.topLabel : '',
            confidence: typeof raw.topConfidence === 'number' ? raw.topConfidence : -1,
        });
    }, []);

    const setPluginErrorOnJS = Worklets.useRunOnJS((msg: string) => setFpError(msg), []);

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
        if (!hasPermission) requestPermission().catch(() => { });
    }, [hasPermission, requestPermission]);

    const announce = (msg: string) => {
        if (speechOn) AccessibilityInfo.announceForAccessibility(msg);
    };
    React.useEffect(() => {
        if (!speechOn || !isActive) ttsStop().catch(() => { });
    }, [speechOn, isActive]);

    // Notifier (kept)
    const notifyDetections = useDetectionsNotifier({
        enabled: speechOn && isActive && detectionStatus === 'ok',
        useTTS: !screenReaderOn,
        stableFrames: 3,
        minConfidence: 0.5,
        perObjectCooldownMs: 5000,
        globalCooldownMs: 400, // low; we control gating
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

    /* Speech Supervisor instance */
    const speechSupervisorRef = React.useRef<SpeechSupervisor | null>(null);
    if (!speechSupervisorRef.current) {
        speechSupervisorRef.current = new SpeechSupervisor({
            estimateMs: estimateSpeechDurationMs,
            interruptGraceMs: SPEECH_INTERRUPT_GRACE_MS,
            minMajorIntervalMs: MIN_MAJOR_INTERVAL_MS,
            minMinorIntervalMs: MIN_MINOR_INTERVAL_MS,
            onSpeak: (phrase) => {
                // One synthetic detection
                notifyDetections([{
                    id: 'speech:aggregate',
                    label: phrase,
                    score: 0.99,
                }]);
            }
        });
    }

    // Direction smoothing cache
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

    // Previous semantic signature
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
    const lastSigRef = React.useRef<Signature | null>(null);

    React.useEffect(() => {
        if (!speechOn || detectionStatus !== 'ok') return;
        const rawList = (objects ?? []) as any[];
        const now = Date.now();
        purgeDirCache(now);
        if (!rawList.length) return;

        // Build infos
        type Info = {
            id: number;
            nat: string;
            distCat?: string;
            score?: number;
            dir?: string | null;
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
            return {
                id: o.id ?? -1,
                nat: naturalLabel(base),
                distCat: distStable,
                score: typeof top?.c === 'number' ? top.c : undefined,
                dir: smoothDirection(o.id ?? -1, rawDir, now)
            };
        }).filter(i => i.nat);

        if (!infos.length) return;

        const groupsMap = new Map<string, Info[]>();
        infos.forEach(i => {
            if (!groupsMap.has(i.nat)) groupsMap.set(i.nat, []);
            groupsMap.get(i.nat)!.push(i);
        });

        // Build phrases + signature groups
        const groupPhrases: { phrase: string; nat: string; priority: number; total: number; hasNear: boolean; critical: boolean; catCounts: Map<string, number> }[] = [];

        groupsMap.forEach((arr, nat) => {
            const catCounts = new Map<string, number>();
            arr.forEach(i => {
                const c = i.distCat || 'unknown';
                catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
            });
            const stableCats = Array.from(catCounts.keys()).filter(c => c !== 'unknown');
            const priority = stableCats.length ? Math.min(...stableCats.map(c => DIST_PRIORITY[c] ?? 3)) : 3;
            const total = arr.length;
            const uniformCat = (stableCats.length === 1 && catCounts.get(stableCats[0]) === total);
            const phrase = buildGroupPhrase(arr, nat, total, uniformCat, stableCats, catCounts);
            const hasNear = (catCounts.get('near') ?? 0) > 0;
            const critical = CRITICAL_LABELS.has(nat);
            groupPhrases.push({ phrase, nat, priority, total, hasNear, critical, catCounts });
        });

        groupPhrases.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.total !== b.total) return b.total - a.total;
            return a.nat.localeCompare(b.nat);
        });
        const selected = groupPhrases.slice(0, MAX_GROUPS_SPOKEN);

        // Build final phrase
        let finalPhrase: string;
        if (selected.length === 1) finalPhrase = selected[0].phrase;
        else {
            const parts = selected.map(g => g.phrase);
            finalPhrase = parts.length === 2
                ? `${parts[0]} and ${parts[1]}`
                : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
        }

        // Build signature
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

        if (changeClass === 'none') {
            // No need to speak
            return;
        }

        // Request speech with priority mapping
        const supervisor = speechSupervisorRef.current!;
        supervisor.requestSpeak(finalPhrase, changeClass);

        lastSigRef.current = sig;
    }, [objects, speechOn, detectionStatus, notifyDetections]);

    function classifyChange(prev: Signature | null, curr: Signature): 'critical' | 'major' | 'minor' | 'none' {
        if (!prev) return 'critical'; // first time => treat as high priority so user gets immediate context

        // Quick structural comparisons
        const criticalFlip = prev.hasCritical !== curr.hasCritical;
        if (criticalFlip) return 'critical';

        const nearGain = !prev.hasNear && curr.hasNear;
        if (nearGain) return 'critical';

        const totalJump = Math.abs(curr.sumBucket - prev.sumBucket) >= 2; // bucketed jump
        if (totalJump && curr.hasNear) return 'critical';

        // Compare group sets (by nat)
        const prevMap = new Map(prev.groups.map(g => [g.nat, g]));
        const currMap = new Map(curr.groups.map(g => [g.nat, g]));

        // New critical group appears
        for (const g of curr.groups) {
            if (g.critical && !prevMap.has(g.nat)) return 'critical';
        }

        // Determine major vs minor:
        let major = false;
        for (const g of curr.groups) {
            const pg = prevMap.get(g.nat);
            if (!pg) {
                // New non-critical group
                major = major || g.hasNear; // only elevate if near to avoid noise
                continue;
            }
            if (pg.priority !== g.priority) {
                // Priority shift (e.g., mid→near)
                if (g.priority < pg.priority) return 'critical'; // got closer
                major = true; // farther -> major
            }
            if (pg.hasNear !== g.hasNear) major = true;
            if (pg.totalBucket !== g.totalBucket) {
                // Count bucket different; treat as minor unless near present
                major = major || g.hasNear;
            }
            // Category composition difference
            const prevCatsKey = pg.cats.map(c => `${c.cat}:${c.count}`).join('|');
            const currCatsKey = g.cats.map(c => `${c.cat}:${c.count}`).join('|');
            if (prevCatsKey !== currCatsKey) major = true;
        }
        // Groups removed
        for (const pg of prev.groups) {
            if (!currMap.has(pg.nat)) {
                major = major || pg.hasNear || pg.critical;
            }
        }

        if (major) return 'major';

        // If anything at all changed (signature object diff) -> minor, else none
        const prevJSON = JSON.stringify(prev);
        const currJSON = JSON.stringify(curr);
        if (prevJSON === currJSON) return 'none';
        return 'minor';
    }

    function buildGroupPhrase(
        arr: { nat: string; distCat?: string; dir?: string | null }[],
        nat: string,
        total: number,
        uniformCat: boolean,
        stableCats: string[],
        catCounts: Map<string, number>
    ): string {
        if (total === 1) {
            const o = arr[0];
            const cat = o.distCat;
            if (o.dir) return cat ? `${o.dir} ${nat} ${cat}` : `${o.dir} ${nat} ahead`;
            return cat ? `${article(nat)} ${nat} ${cat}` : `${article(nat)} ${nat} ahead`;
        }
        if (uniformCat) {
            const cat = stableCats[0];
            const allDirs = arr.every(o => o.dir);
            if (allDirs && total <= INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT) {
                const dirs = arr
                    .map(o => o.dir!)
                    .sort((a, b) => (DIRECTION_ORDER[a] ?? 99) - (DIRECTION_ORDER[b] ?? 99));
                const uniq: string[] = [];
                dirs.forEach(d => { if (!uniq.includes(d)) uniq.push(d); });
                return `${total} ${pluralize(nat, total)} ${cat}: ${joinHuman(uniq)}`;
            }
            return `${total} ${pluralize(nat, total)} ${cat}`;
        }
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
            return `${total} ${pluralize(nat, total)}: ${segments.join(', ')}`;
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
        return `${total} ${pluralize(nat, total)}: ${parts.join(', ')}`;
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
        if (!supportsTorch) { announce('Torch not available on this camera'); return; }
        if (!isActive) { announce('Cannot toggle torch while live view is paused'); return; }
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
                    } else ttsSpeak('Speech on.').catch(() => { });
                } else AccessibilityInfo.announceForAccessibility('Speech on');
            } else {
                ttsStop().catch(() => { speechSupervisorRef.current?.notifyStopped(); });
                AccessibilityInfo.announceForAccessibility('Speech off');
            }
            return next;
        });
    };
    const toggleCameraPosition = () => {
        setCameraPosition(p => {
            const next = p === 'back' ? 'front' : 'back';
            announce(next === 'front' ? 'Front camera active' : 'Rear camera active');
            if (torch === 'on' && device?.hasTorch === false) setTorch('off');
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
                accessible accessibilityRole="button"
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