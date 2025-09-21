import Buttons from '@/components/Buttons';
import { FilterIntensitySelector } from '@/components/FilterIntensitySelector';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorBlindness } from '@/context/ColorBlindnessContext';
import { getClusters, getConfusionStats, recolorAssistedImage } from '@/hooks/ColorAssist';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import {
    AccessibilityInfo,
    Image,
    Modal,
    Platform,
    Share,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraPermission } from 'react-native-vision-camera';

function avgNearestNeighborLab(clusters: { centroid_lab: [number, number, number] }[]) {
    if (!clusters || clusters.length < 2) return 0;
    const labs = clusters.map(c => c.centroid_lab as [number, number, number]);
    const dists: number[] = [];
    for (let i = 0; i < labs.length; i++) {
        let best = Infinity;
        const [L1, a1, b1] = labs[i];
        for (let j = 0; j < labs.length; j++) {
            if (i === j) continue;
            const [L2, a2, b2] = labs[j];
            const dL = L1 - L2, da = a1 - a2, db = b1 - b2;
            const d = Math.sqrt(dL * dL + da * da + db * db);
            if (d < best) best = d;
        }
        dists.push(best);
    }
    return dists.reduce((s, v) => s + v, 0) / dists.length;
}

function avgNearestNeighborLabSim(clusters: any[]) {
    if (!clusters || clusters.length < 2) return 0;
    const hasSim = clusters[0]?.centroid_lab_sim?.length === 3;
    if (!hasSim) return 0;
    const labs = clusters.map(c => c.centroid_lab_sim as [number, number, number]);
    const dists: number[] = [];
    for (let i = 0; i < labs.length; i++) {
        let best = Infinity;
        const [L1, a1, b1] = labs[i];
        for (let j = 0; j < labs.length; j++) {
            if (i === j) continue;
            const [L2, a2, b2] = labs[j];
            const dL = L1 - L2, da = a1 - a2, db = b1 - b2;
            const d = Math.sqrt(dL * dL + da * da + db * db);
            if (d < best) best = d;
        }
        dists.push(best);
    }
    return dists.reduce((s, v) => s + v, 0) / dists.length;
}

export default function ColorBlindCameraScreen() {
    const [cameraPosition] = React.useState<'back' | 'front'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [isActive, setIsActive] = React.useState(true);
    const [intensityOpen, setIntensityOpen] = React.useState(false);
    const cameraRef = React.useRef<Camera>(null);

    const { hasPermission, requestPermission } = useCameraPermission();
    const colorScheme = useColorScheme() ?? 'light';
    const themeColors = Colors[colorScheme];
    const navigation = useNavigation<DrawerNavigationProp<any>>();

    const { selectedType, loading: cbLoading, valid, intensity, setIntensity, strength } = useColorBlindness();
    const hasRedirectedRef = React.useRef(false);

    const { device, format, fps, supportsTorch } = useSimpleFormat(cameraPosition);

    const [previewUri, setPreviewUri] = React.useState<string | null>(null);
    const [processing, setProcessing] = React.useState(false);

    // NEW: store original, toggle for before/after, and outcome line
    const [origUri, setOrigUri] = React.useState<string | null>(null);
    const [showOriginal, setShowOriginal] = React.useState(false);
    const [outcome, setOutcome] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!hasPermission) requestPermission().catch(() => { });
    }, [hasPermission, requestPermission]);

    React.useEffect(() => {
        if (cbLoading) return;
        if (!valid && !hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            // @ts-ignore
            navigation.navigate('colorBlindnessSelect');
            AccessibilityInfo.announceForAccessibility?.('Please select your color blindness type first.');
        }
    }, [valid, cbLoading, navigation]);

    if (!hasPermission)
        return (
            <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="Camera permission required">
                <ThemedText style={styles.permissionText}>Camera permission is required.</ThemedText>
            </ThemedView>
        );
    if (!device)
        return (
            <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="No camera device found">
                <ThemedText style={styles.permissionText}>No camera device found.</ThemedText>
            </ThemedView>
        );

    const torchDisabled = !isActive || !supportsTorch;

    const toggleActive = () => {
        setIsActive((prev) => {
            const next = !prev;
            if (!next && torch === 'on') setTorch('off');
            return next;
        });
    };

    const toggleTorch = () => {
        if (torchDisabled) return;
        setTorch((t) => (t === 'off' ? 'on' : 'off'));
    };

    const intensityDisabled = !valid;

    const captureAndProcess = async () => {
        try {
            setProcessing(true);
            const cam = cameraRef.current;
            if (!cam) throw new Error('Camera ref unavailable');

            const t0 = Date.now();
            const photo = await cam.takePhoto({ flash: 'off', enableShutterSound: true });
            const inputPath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
            setOrigUri(inputPath);
            setShowOriginal(false);
            setOutcome(null);

            // Fixed protanopia path
            const K = 8;
            const DELTA = 25;
            const ANALYSIS_MAX = 384;
            const OUTPUT_MAX = 1280;
            const LINES = 17;
            const TYPE = 'protanopia';

            // BEFORE metrics (on original)
            const tB0 = Date.now();
            const statsBefore = await getConfusionStats(inputPath, TYPE, DELTA, ANALYSIS_MAX);
            const clustersBefore = await getClusters(inputPath, TYPE, K, DELTA, ANALYSIS_MAX, 10);
            const sepBeforeLab = avgNearestNeighborLab(clustersBefore.clusters || []);
            const sepBeforeSim = avgNearestNeighborLabSim(clustersBefore.clusters || []);
            const tB1 = Date.now();

            // Recolor (native)
            const tR0 = Date.now();
            const processedUri = await recolorAssistedImage(
                inputPath, TYPE, strength, K, DELTA, ANALYSIS_MAX, LINES, OUTPUT_MAX
            );
            const tR1 = Date.now();

            // AFTER metrics (on processed)
            const tA0 = Date.now();
            const statsAfter = await getConfusionStats(processedUri, TYPE, DELTA, ANALYSIS_MAX);
            const clustersAfter = await getClusters(processedUri, TYPE, K, DELTA, ANALYSIS_MAX, 10);
            const sepAfterLab = avgNearestNeighborLab(clustersAfter.clusters || []);
            const sepAfterSim = avgNearestNeighborLabSim(clustersAfter.clusters || []);
            const tA1 = Date.now();

            // Logs (keep essential only)
            console.log('BEFORE Confusion stats:', statsBefore);
            console.log('AFTER  Confusion stats:', statsAfter);
            console.log('Cluster separation (avg NN): Lab before=', sepBeforeLab.toFixed(2), ' after=', sepAfterLab.toFixed(2),
                ' | Sim-Lab before=', sepBeforeSim.toFixed(2), ' after=', sepAfterSim.toFixed(2));

            console.log('Timings ms:', {
                capture: tB0 - t0,
                beforeMetrics: tB1 - tB0,
                recolor: tR1 - tR0,
                afterMetrics: tA1 - tA0,
                total: Date.now() - t0
            });

            // NEW: Outcome line (simple, avoids hidden native thresholds)
            const beforePct = (statsBefore?.ratio ?? 0) * 100;
            const afterPct = (statsAfter?.ratio ?? 0) * 100;
            const reduction = beforePct - afterPct;
            let msg: string;
            if (reduction > 0.2) {
                msg = `Assist applied: confusing ${beforePct.toFixed(1)}% → ${afterPct.toFixed(1)}% (−${reduction.toFixed(1)}%)`;
            } else if (beforePct < 1) {
                msg = 'Scene low confusion; assist likely skipped.';
            } else {
                msg = 'Assist applied (no significant change).';
            }
            setOutcome(msg);
            AccessibilityInfo.announceForAccessibility?.(msg);

            setPreviewUri(processedUri);
        } catch (e) {
            console.warn('[ColorAssist] capture/process failed:', e);
        } finally {
            setProcessing(false);
        }
    };

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

            <View style={styles.headerRow} accessible accessibilityLabel="Color blind camera header">
                <ThemedText style={styles.title}>Color Blind Camera</ThemedText>
            </View>

            <View
                style={styles.previewWrapper}
                accessible
                accessibilityLabel={`Live camera preview (${isActive ? 'running' : 'paused'})`}
                accessibilityHint="Use the controls overlaid on the preview."
            >
                <Camera
                    ref={cameraRef}
                    style={{ flex: 1 }}
                    device={device}
                    isActive={isActive}
                    resizeMode="cover"
                    torch={torch}
                    photo={true}
                    androidPreviewViewType="texture-view"
                    {...(format ? { format } : {})}
                    {...(format && fps ? { fps } : {})}
                />

                <View style={styles.overlayContainer} pointerEvents="box-none">
                    <View className="topRow" style={styles.topRow} pointerEvents="box-none">
                        <View
                            style={[
                                intensityOpen ? styles.intensityPanel : styles.intensityPillCollapsed,
                            { backgroundColor: themeColors.surface, borderColor: themeColors.divider },
                            ]}
                        >
                            {intensityOpen ? (
                                <View accessible accessibilityLabel="Filter intensity controls">
                                    <View style={{ marginBottom: 6 }}>
                                        <ThemedText style={[styles.intensityLabel, { color: themeColors.textSecondary }]}>
                                            Filter intensity
                                        </ThemedText>
                                    </View>
                                    <FilterIntensitySelector
                                        value={intensity}
                                        onChange={(v) => setIntensity(v)}
                                        disabled={!valid}
                                        theme={{
                                            text: themeColors.text,
                                            divider: themeColors.divider,
                                            accent: themeColors.accent,
                                            secondaryAccent: (themeColors as any).secondaryAccent,
                                            surface: themeColors.surface,
                                            textSecondary: themeColors.textSecondary,
                                        }}
                                    />
                                    <TouchableOpacity
                                        onPress={() => {
                                            // @ts-ignore
                                            navigation.navigate('colorBlindnessSelect');
                                        }}
                                        style={{ paddingVertical: 6, alignSelf: 'flex-end' }}
                                        accessible
                                        accessibilityRole="button"
                                        accessibilityLabel="Change type"
                                        accessibilityHint="Opens the color blindness type selection screen"
                                    >
                                        <ThemedText style={[styles.changeTypeText, { color: themeColors.accent }]}>Change type</ThemedText>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setIntensityOpen(false)}
                                        style={{ position: 'absolute', top: 6, right: 8, padding: 6 }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Collapse filter intensity panel"
                                    >
                                        <Ionicons name="chevron-up" size={18} color={themeColors.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => setIntensityOpen(true)}
                                    disabled={!valid}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                    accessible
                                    accessibilityRole="button"
                                    accessibilityLabel={`Filter intensity ${intensity} of 5`}
                                    accessibilityHint="Opens intensity controls"
                                >
                                    <Ionicons name="options-outline" size={18} color={themeColors.text} />
                                    <ThemedText style={[styles.pillText, { color: themeColors.text }]}>
                                        Intensity {intensity}/5
                                    </ThemedText>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <View style={styles.bottomRowOverlay} pointerEvents="box-none">
                        <Buttons
                            iconName={supportsTorch ? (torch === 'on' ? 'flashlight' : 'flashlight-outline') : 'flash-off-outline'}
                            onPress={toggleTorch}
                            accessibilityLabel={supportsTorch ? (torch === 'on' ? 'Turn torch off' : 'Turn torch on') : 'Torch unavailable'}
                            accessibilityState={{ disabled: !isActive || !supportsTorch, checked: supportsTorch ? torch === 'on' : undefined }}
                            disabled={!isActive || !supportsTorch}
                            circular
                            size="lg"
                            variant={torch === 'on' ? 'primary' : 'surface'}
                        />

                        <Buttons
                            title={processing ? 'Processing…' : 'Capture'}
                            onPress={captureAndProcess}
                            accessibilityLabel="Capture and preview corrected image"
                            accessibilityState={{ disabled: processing || !valid, busy: processing || undefined }}
                            disabled={processing || !valid}
                            circular
                            size="xl"
                            variant="primary"
                        />

                        <Buttons
                            title={isActive ? 'Pause' : 'Resume'}
                            onPress={toggleActive}
                            accessibilityLabel={isActive ? 'Pause live view' : 'Resume live view'}
                            accessibilityState={{ checked: isActive }}
                            circular
                            size="lg"
                            variant={isActive ? 'danger' : 'primary'}
                        />
                    </View>
                </View>
            </View>

            <Modal
                visible={!!previewUri}
                transparent={false}
                animationType="slide"
                onRequestClose={() => setPreviewUri(null)}
            >
                <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 }}>
                        {previewUri ? (
                            <Image
                                source={{ uri: (showOriginal && origUri) ? origUri : previewUri }}
                                resizeMode="contain"
                                style={{ width: '100%', height: '78%' }}
                                accessible
                                accessibilityLabel={showOriginal ? 'Original image preview' : 'Corrected image preview'}
                            />
                        ) : null}

                        {/* Outcome line */}
                        {outcome ? (
                            <ThemedText style={{ marginTop: 8, marginBottom: 10, textAlign: 'center' }}>
                                {outcome}
                            </ThemedText>
                        ) : null}

                        {/* Controls */}
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                            {origUri && previewUri ? (
                                <Buttons
                                    title={showOriginal ? 'Show corrected' : 'Show original'}
                                    onPress={() => setShowOriginal(v => !v)}
                                    accessibilityLabel="Toggle original and corrected image"
                                />
                            ) : null}
                            {previewUri ? (
                                <Buttons
                                    title="Share"
                                    onPress={async () => {
                                        try {
                                            await Share.share({
                                                message: 'SEEiT corrected image',
                                                url: previewUri,
                                            })
                                        } catch { /* noop */ }
                                    }}
                                    accessibilityLabel="Share corrected image"
                                />
                            ) : null}
                            <Buttons
                                title="Close"
                                onPress={() => setPreviewUri(null)}
                                accessibilityLabel="Close preview"
                            />
                        </View>
                    </View>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: Platform.OS === 'android' ? 20 : 0 },
    drawerToggle: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 40 : 10,
        right: 10,
        zIndex: 10,
        padding: 8,
        borderRadius: 20,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 2, marginBottom: 10 },
    title: { fontFamily: 'AtkinsonBold', fontSize: 22, textAlign: 'center' },
    previewWrapper: { flex: 1, borderRadius: 10, overflow: 'hidden', marginHorizontal: 12, marginBottom: 12 },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
        padding: 12,
        pointerEvents: 'box-none',
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        pointerEvents: 'box-none',
    },
    intensityPillCollapsed: {
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 6,
        paddingHorizontal: 10,
        alignSelf: 'flex-end',
    },
    pillText: {
        fontFamily: 'Atkinson',
        fontSize: 14,
    },
    intensityPanel: {
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 10,
        minWidth: 220,
        maxWidth: 300,
        alignSelf: 'flex-end',
    },
    changeTypeText: {
        fontFamily: 'Atkinson',
        fontSize: 14,
    },
    intensityLabel: {
        fontFamily: 'Atkinson',
        fontSize: 12,
    },
    bottomRowOverlay: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
    },
    center: { flex: 1, justifyContent: 'center', padding: 32 },
    permissionText: { fontSize: 20, fontFamily: 'AtkinsonBold', textAlign: 'center' },
});