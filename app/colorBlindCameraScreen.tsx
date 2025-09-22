import Buttons from '@/components/Buttons';
import { CrosshairOverlay } from '@/components/CrosshairOverlay';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorBlindness } from '@/context/ColorBlindnessContext';
import { detectRedGreenRegions, generateBoundaryLossHeatmap, generateMatchMask, samplePixels } from '@/hooks/ProtanTools';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { computeContainedRect } from '@/utils/containedRect';
import { nameColor } from '@/utils/protan';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import React from 'react';
import {
    AccessibilityInfo,
    Image,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraPermission } from 'react-native-vision-camera';

// RG finder thresholds
const RG_MIN_SAT = 0.35;
const RG_MIN_AREA_FRAC = 0.004;
const RG_MIN_VAL = 0.20;

type Pt = { x: number; y: number }
type RGRegion = { label: 'red' | 'green'; x: number; y: number; w: number; h: number; areaFrac: number }

export default function ColorBlindCameraScreen() {
    const [cameraPosition] = React.useState<'back' | 'front'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [isActive] = React.useState(true);
    const cameraRef = React.useRef<Camera>(null);

    const { hasPermission, requestPermission } = useCameraPermission();
    const colorScheme = useColorScheme() ?? 'light';
    const themeColors = Colors[colorScheme];
    const navigation = useNavigation<DrawerNavigationProp<any>>();

    const { loading: cbLoading, valid } = useColorBlindness();
    const hasRedirectedRef = React.useRef(false);

    const { device, format, fps, supportsTorch } = useSimpleFormat(cameraPosition);

    // Analysis state
    const [photoUri, setPhotoUri] = React.useState<string | null>(null);
    const [processing, setProcessing] = React.useState(false);

    // Overlays + geometry
    const [heatUri, setHeatUri] = React.useState<string | null>(null);
    const [heatW, setHeatW] = React.useState<number>(0);
    const [heatH, setHeatH] = React.useState<number>(0);
    const [containerW, setContainerW] = React.useState(0);
    const [containerH, setContainerH] = React.useState(0);
    const imageRect = React.useMemo(() => computeContainedRect(containerW, containerH, heatW, heatH), [containerW, containerH, heatW, heatH]);

    // Feature toggles
    const [showHeat, setShowHeat] = React.useState(true);
    const [showRG, setShowRG] = React.useState(false);
    const [showMatch, setShowMatch] = React.useState(false);
    const [matchTol, setMatchTol] = React.useState(18);
    const [debouncedTol, setDebouncedTol] = React.useState(matchTol);

    // Crosshairs
    const [A, setA] = React.useState<Pt | undefined>(undefined);
    const [B, setB] = React.useState<Pt | undefined>(undefined);
    const [AInfo, setAInfo] = React.useState<any | null>(null);
    const [BInfo, setBInfo] = React.useState<any | null>(null);

    // RG regions and match overlay
    const [rgRegions, setRgRegions] = React.useState<RGRegion[]>([]);
    const [matchUri, setMatchUri] = React.useState<string | null>(null);

    React.useEffect(() => { if (!hasPermission) requestPermission().catch(() => { }); }, [hasPermission, requestPermission]);

    React.useEffect(() => {
        if (cbLoading) return;
        if (!valid && !hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            // @ts-ignore
            navigation.navigate('colorBlindnessSelect');
            AccessibilityInfo.announceForAccessibility?.('Please select your color blindness type first.');
        }
    }, [valid, cbLoading, navigation]);

    const torchDisabled = !isActive || !supportsTorch;
    const toggleTorch = () => {
        if (torchDisabled) return;
        setTorch(t => (t === 'off' ? 'on' : 'off'));
    };

    // Debounce tolerance to avoid hammering native
    React.useEffect(() => {
        const id = setTimeout(() => setDebouncedTol(matchTol), 180);
        return () => clearTimeout(id);
    }, [matchTol]);

    const captureAndAnalyze = async () => {
        try {
            setProcessing(true);
            const cam = cameraRef.current;
            if (!cam) throw new Error('Camera ref unavailable');
            const photo = await cam.takePhoto({ flash: 'off', enableShutterSound: true });
            const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
            setPhotoUri(uri);

            setA(undefined); setB(undefined); setAInfo(null); setBInfo(null);
            setRgRegions([]); setMatchUri(null);

            const hm = await generateBoundaryLossHeatmap(uri, 360);
            setHeatUri(hm.overlayUri);
            setHeatW(hm.width); setHeatH(hm.height);

            if (showRG) {
                try {
                    const res = await detectRedGreenRegions(uri, 360, RG_MIN_SAT, RG_MIN_AREA_FRAC, RG_MIN_VAL);
                    const regs = (res.regions || []) as RGRegion[];
                    setRgRegions(regs);
                } catch { }
            }
        } catch (e) {
            console.warn('[Analyze] failed:', e);
        } finally {
            setProcessing(false);
        }
    };

    const onImagePress = (evt: any) => {
        const { locationX, locationY } = evt.nativeEvent;
        const { left, top, width, height } = imageRect;
        if (width <= 0 || height <= 0) return;
        if (locationX < left || locationX > left + width || locationY < top || locationY > top + height) return;
        const nx = (locationX - left) / width;
        const ny = (locationY - top) / height;
        if (!A) setA({ x: nx, y: ny });
        else if (!B) setB({ x: nx, y: ny });
        else setA({ x: nx, y: ny });
    };

    const refreshSamples = React.useCallback(async () => {
        if (!photoUri) return;
        const pts: Pt[] = [];
        if (A) pts.push(A);
        if (B) pts.push(B);
        if (pts.length === 0) return;
        try {
            const res = await samplePixels(photoUri, pts, 1024);
            const s = res.samples;
            if (A) setAInfo(s[0]);
            if (B && s.length > 1) setBInfo(s[1]);
        } catch (e) {
            console.warn('[Sample] failed:', e);
        }
    }, [photoUri, A, B]);
    React.useEffect(() => { refreshSamples() }, [A, B, refreshSamples]);

    React.useEffect(() => {
        (async () => {
            if (!photoUri || !showMatch || !AInfo) { setMatchUri(null); return; }
            try {
                const mm = await generateMatchMask(photoUri, AInfo.L, AInfo.a, AInfo.bLab, debouncedTol, 360);
                setMatchUri(mm.overlayUri);
            } catch (e) {
                console.warn('[Match] failed:', e);
                setMatchUri(null);
            }
        })();
    }, [photoUri, showMatch, AInfo, debouncedTol]);

    React.useEffect(() => {
        (async () => {
            if (!photoUri || !showRG) { setRgRegions([]); return; }
            try {
                const res = await detectRedGreenRegions(photoUri, 360, RG_MIN_SAT, RG_MIN_AREA_FRAC, RG_MIN_VAL);
                const regs = (res.regions || []) as RGRegion[];
                setRgRegions(regs);
            } catch (e) {
                console.warn('[RG] failed:', e);
                setRgRegions([]);
            }
        })();
    }, [photoUri, showRG]);

    const simPairDeltaE = React.useMemo(() => {
        if (!AInfo || !BInfo) return null;
        const dL = (AInfo.LSim - BInfo.LSim);
        const da = (AInfo.aSim - BInfo.aSim);
        const db = (AInfo.bLabSim - BInfo.bLabSim);
        return Math.sqrt(dL * dL + da * da + db * db);
    }, [AInfo, BInfo]);

    const mapBox = (r: RGRegion) => {
        const { left, top, width, height } = imageRect;
        return {
            left: left + r.x * width,
            top: top + r.y * height,
            width: r.w * width,
            height: r.h * height,
        };
    };

    const redCount = rgRegions.filter(r => r.label === 'red').length;
    const greenCount = rgRegions.filter(r => r.label === 'green').length;

    async function onShare(uri?: string | null) {
        if (!uri) return;
        try {
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { dialogTitle: 'Share SEEiT analysis', mimeType: 'image/*' });
                return;
            }
        } catch { /* fall through */ }
        try {
            await Share.share({ message: `SEEiT analysis: ${uri}` });
        } catch { /* no-op */ }
    }

    if (!hasPermission) {
        return (
            <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="Camera permission required">
                <ThemedText style={styles.permissionText}>Camera permission is required.</ThemedText>
            </ThemedView>
        );
    }
    if (!device) {
        return (
            <ThemedView style={styles.center} accessible accessibilityRole="alert" accessibilityLabel="No camera device found">
                <ThemedText style={styles.permissionText}>No camera device found.</ThemedText>
            </ThemedView>
        );
    }

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

            <View style={styles.headerRow} accessible accessibilityLabel="Camera header">
                <ThemedText style={styles.title}>Protan Assist</ThemedText>
            </View>

            <View style={styles.previewWrapper} accessible accessibilityLabel={`Live camera preview (${isActive ? 'running' : 'paused'})`}>
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
            </View>

            <View style={styles.controlsRow}>
                <Buttons
                    iconName={supportsTorch ? (torch === 'on' ? 'flashlight' : 'flashlight-outline') : 'flash-off-outline'}
                    onPress={toggleTorch}
                    accessibilityLabel={supportsTorch ? (torch === 'on' ? 'Turn torch off' : 'Turn torch on') : 'Torch unavailable'}
                    accessibilityState={{ disabled: !isActive || !supportsTorch, checked: supportsTorch ? torch === 'on' : undefined }}
                    disabled={!isActive || !supportsTorch}
                    circular size="lg" variant={torch === 'on' ? 'primary' : 'surface'}
                />
                <Buttons
                    title={processing ? 'Analyzing…' : 'Capture'}
                    onPress={captureAndAnalyze}
                    accessibilityLabel="Capture and analyze scene"
                    accessibilityState={{ disabled: processing || !valid, busy: processing || undefined }}
                    disabled={processing || !valid}
                    circular size="xl" variant="primary"
                />
                <View style={{ width: 56 }} />
            </View>

            <Modal
                visible={!!photoUri}
                transparent={false}
                animationType="slide"
                onRequestClose={() => {
                    setPhotoUri(null); setHeatUri(null); setMatchUri(null); setRgRegions([]);
                    setA(undefined); setB(undefined); setAInfo(null); setBInfo(null);
                }}
            >
                <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                    <View style={{ flex: 1 }}>
                        <View
                            style={{ width: '100%', height: '58%', justifyContent: 'center', alignItems: 'center' }}
                            onLayout={e => {
                                const { width, height } = e.nativeEvent.layout;
                                setContainerW(width); setContainerH(height);
                            }}
                        >
                            {photoUri ? (
                                <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={onImagePress}
                                    style={{ width: '100%', height: '100%' }}
                                    accessible
                                    accessibilityLabel="Analyzed image"
                                >
                                    <Image source={{ uri: photoUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
                                    {showHeat && heatUri ? (<Image source={{ uri: heatUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />) : null}
                                    {matchUri ? (<Image source={{ uri: matchUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />) : null}
                                    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                                        {rgRegions.map((r, idx) => {
                                            const box = mapBox(r);
                                            const isRed = r.label === 'red'
                                            const borderColor = isRed ? '#ff5252' : '#00e676'
                                            const bg = isRed ? 'rgba(255,82,82,0.12)' : 'rgba(0,230,118,0.12)'
                                            const borderStyle = isRed ? 'solid' as const : 'dashed' as const
                                            return (
                                                <View
                                                    key={`${r.label}-${idx}`}
                                                    style={[
                                                        styles.rgBox,
                                                        { left: box.left, top: box.top, width: box.width, height: box.height, borderColor, backgroundColor: bg, borderStyle }
                                                    ]}
                                                >
                                                    <View style={styles.badge}>
                                                        <ThemedText style={styles.badgeText}>{isRed ? 'R' : 'G'}</ThemedText>
                                                    </View>
                                                </View>
                                            )
                                        })}
                                    </View>
                                    <CrosshairOverlay A={A} B={B} imageRect={imageRect} />
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 88 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6, gap: 8, alignItems: 'center' }}>
                                <TouchableOpacity onPress={() => setShowHeat(v => !v)} style={styles.pill} accessibilityRole="switch" accessibilityLabel="Toggle boundary-loss heatmap" accessibilityState={{ checked: showHeat }}>
                                    <ThemedText>{showHeat ? 'Heatmap: On' : 'Heatmap: Off'}</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowRG(v => !v)} style={styles.pill} accessibilityRole="switch" accessibilityLabel="Toggle Red/Green Finder" accessibilityState={{ checked: showRG }}>
                                    <ThemedText>{showRG ? `RG Finder: R${redCount} G${greenCount}` : 'RG Finder: Off'}</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowMatch(v => !v)} style={styles.pill} accessibilityRole="switch" accessibilityLabel="Toggle highlight similar to A" accessibilityState={{ checked: showMatch, disabled: !AInfo }}>
                                    <ThemedText>{showMatch ? 'Highlight A-like: On' : 'Highlight A-like: Off'}</ThemedText>
                                </TouchableOpacity>
                                {showMatch ? (
                                    <View style={[styles.pill, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} accessibilityLabel="Tolerance for A-like highlight">
                                        <TouchableOpacity onPress={() => setMatchTol(t => Math.max(8, t - 2))}><ThemedText>-</ThemedText></TouchableOpacity>
                                        <ThemedText>Tolerance {matchTol}</ThemedText>
                                        <TouchableOpacity onPress={() => setMatchTol(t => Math.min(30, t + 2))}><ThemedText>+</ThemedText></TouchableOpacity>
                                    </View>
                                ) : null}
                                <TouchableOpacity onPress={() => { setA(undefined); setB(undefined); setAInfo(null); setBInfo(null); }} style={styles.pill} accessibilityRole="button" accessibilityLabel="Clear points A and B">
                                    <ThemedText>Clear points</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={async () => {
                                        if (!photoUri) return;
                                        try {
                                            if (showHeat) {
                                                const hm = await generateBoundaryLossHeatmap(photoUri, 360);
                                                setHeatUri(hm.overlayUri); setHeatW(hm.width); setHeatH(hm.height);
                                            }
                                            if (showRG) {
                                                const res = await detectRedGreenRegions(photoUri, 360, RG_MIN_SAT, RG_MIN_AREA_FRAC, RG_MIN_VAL);
                                                const regs = (res.regions || []) as RGRegion[];
                                                setRgRegions(regs);
                                            }
                                            if (showMatch && AInfo) {
                                                const mm = await generateMatchMask(photoUri, AInfo.L, AInfo.a, AInfo.bLab, debouncedTol, 360);
                                                setMatchUri(mm.overlayUri);
                                            }
                                        } catch { }
                                    }}
                                    style={styles.pill}
                                    accessibilityRole="button"
                                    accessibilityLabel="Recompute overlays"
                                >
                                    <ThemedText>Recompute</ThemedText>
                                </TouchableOpacity>
                            </ScrollView>

                            <View style={styles.infoRow}>
                                <ThemedText style={styles.infoText}>
                                    {AInfo ? `A: ${nameColor({ r: AInfo.r, g: AInfo.g, b: AInfo.b })} → ${nameColor({ r: AInfo.rSim, g: AInfo.gSim, b: AInfo.bSim })}  (Shift ${AInfo.deltaE.toFixed(1)})` : 'Tap to place A'}
                                </ThemedText>
                            </View>
                            <View style={styles.infoRow}>
                                <ThemedText style={styles.infoText}>
                                    {BInfo ? `B: ${nameColor({ r: BInfo.r, g: BInfo.g, b: BInfo.b })} → ${nameColor({ r: BInfo.rSim, g: BInfo.gSim, b: BInfo.bSim })}  (Shift ${BInfo.deltaE.toFixed(1)})` : (A ? 'Tap again to place B (optional)' : ' ')}
                                </ThemedText>
                            </View>
                            {simPairDeltaE != null && (
                                <View style={styles.infoRow}>
                                    <ThemedText style={styles.infoText}>
                                        A vs B for protan: {simPairDeltaE.toFixed(1)} {simPairDeltaE < 10 ? '— Confusable' : simPairDeltaE < 12 ? '— Borderline' : '— Distinct'}
                                    </ThemedText>
                                </View>
                            )}
                        </ScrollView>

                        <View style={[styles.actionBar, { backgroundColor: themeColors.background, borderTopColor: Colors[colorScheme].divider }]}>
                            <Buttons
                                title="Share"
                                iconName="share-social-outline"
                                onPress={() => onShare(photoUri)}
                                variant="primary"
                                containerStyle={{ flex: 1, alignSelf: 'auto' }}
                            />
                            <Buttons
                                title="Close"
                                iconName="close"
                                onPress={() => { setPhotoUri(null); setHeatUri(null); setMatchUri(null); setRgRegions([]); setA(undefined); setB(undefined); setAInfo(null); setBInfo(null); }}
                                variant="outline"
                                containerStyle={{ flex: 1, alignSelf: 'auto' }}
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
    drawerToggle: { position: 'absolute', top: Platform.OS === 'android' ? 40 : 10, right: 10, zIndex: 10, padding: 8, borderRadius: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 2, marginBottom: 10 },
    title: { fontFamily: 'AtkinsonBold', fontSize: 22, textAlign: 'center' },
    previewWrapper: { flex: 1, borderRadius: 10, overflow: 'hidden', marginHorizontal: 12, marginBottom: 12 },
    controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: 10 },
    center: { flex: 1, justifyContent: 'center', padding: 32 },
    permissionText: { fontSize: 20, fontFamily: 'AtkinsonBold', textAlign: 'center' },
    pill: { backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginRight: 8 },
    infoRow: { marginVertical: 4, paddingHorizontal: 2 },
    infoText: { fontSize: 14 },
    rgBox: { position: 'absolute', borderWidth: 2, borderRadius: 4 },
    badge: { position: 'absolute', top: -18, left: -2, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    actionBar: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
});