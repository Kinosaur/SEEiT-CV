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

            // Heatmap first (sets analysis dimensions)
            const hm = await generateBoundaryLossHeatmap(uri, 360);
            setHeatUri(hm.overlayUri);
            setHeatW(hm.width); setHeatH(hm.height);

            // Optionally auto-run RG finder if toggled on
            if (showRG) {
                try {
                    const res = await detectRedGreenRegions(uri, 360, 0.35, 0.008);
                    const regs = (res.regions || []).map(r => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, areaFrac: r.areaFrac }));
                    setRgRegions(regs);
                } catch { }
            }
        } catch (e) {
            console.warn('[Analyze] failed:', e);
        } finally {
            setProcessing(false);
        }
    };

    // Tap to place A/B (map only if inside contained rect)
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

    // Re-sample A/B
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

    // Recompute match overlay whenever toggled, A exists, or tolerance changes
    React.useEffect(() => {
        (async () => {
            if (!photoUri || !showMatch || !AInfo) { setMatchUri(null); return; }
            try {
                const mm = await generateMatchMask(photoUri, AInfo.L, AInfo.a, AInfo.bLab, matchTol, 360);
                setMatchUri(mm.overlayUri);
            } catch (e) {
                console.warn('[Match] failed:', e);
                setMatchUri(null);
            }
        })();
         
    }, [photoUri, showMatch, AInfo, matchTol]);

    // Re-run RG finder when toggled on in an open analysis
    React.useEffect(() => {
        (async () => {
            if (!photoUri || !showRG) { setRgRegions([]); return; }
            try {
                const res = await detectRedGreenRegions(photoUri, 360, 0.35, 0.008);
                const regs = (res.regions || []).map(r => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, areaFrac: r.areaFrac }));
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

    // Helpers for overlay drawing
    const mapBox = (r: RGRegion) => {
        const { left, top, width, height } = imageRect;
        return {
            left: left + r.x * width,
            top: top + r.y * height,
            width: r.w * width,
            height: r.h * height,
        };
    };

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
                    title={processing ? 'Analyzing…' : 'Capture & Analyze'}
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
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 10 }}>
                        {photoUri ? (
                            <View
                                style={{ width: '100%', height: '75%' }}
                                onLayout={e => {
                                    const { width, height } = e.nativeEvent.layout;
                                    setContainerW(width); setContainerH(height);
                                }}
                            >
                                <TouchableOpacity activeOpacity={1} onPress={onImagePress} style={{ flex: 1 }} accessible accessibilityLabel="Analyzed image">
                                    <Image source={{ uri: photoUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
                                    {showHeat && heatUri ? (<Image source={{ uri: heatUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />) : null}
                                    {matchUri ? (<Image source={{ uri: matchUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />) : null}
                                    {/* RG boxes */}
                                    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                                        {rgRegions.map((r, idx) => {
                                            const box = mapBox(r);
                                            const borderColor = r.label === 'red' ? '#ff5252' : '#00e676'
                                            const bg = r.label === 'red' ? 'rgba(255,82,82,0.12)' : 'rgba(0,230,118,0.12)'
                                            return (
                                                <View key={`${r.label}-${idx}`} style={[styles.rgBox, { left: box.left, top: box.top, width: box.width, height: box.height, borderColor, backgroundColor: bg }]}>
                                                    <View style={styles.badge}>
                                                        <ThemedText style={styles.badgeText}>{r.label === 'red' ? 'R' : 'G'}</ThemedText>
                                                    </View>
                                                </View>
                                            )
                                        })}
                                    </View>
                                    <CrosshairOverlay A={A} B={B} imageRect={imageRect} />
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        {/* Toolbar */}
                        <View style={{ marginTop: 8, width: '100%', paddingHorizontal: 10, gap: 8 }}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                <TouchableOpacity onPress={() => setShowHeat(v => !v)} style={styles.pill}><ThemedText>{showHeat ? 'Heatmap: On' : 'Heatmap: Off'}</ThemedText></TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowRG(v => !v)} style={styles.pill}><ThemedText>{showRG ? 'RG Finder: On' : 'RG Finder: Off'}</ThemedText></TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowMatch(v => !v)} style={styles.pill}><ThemedText>{showMatch ? 'Highlight A-like: On' : 'Highlight A-like: Off'}</ThemedText></TouchableOpacity>
                                {showMatch ? (
                                    <View style={[styles.pill, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                                        <TouchableOpacity onPress={() => setMatchTol(t => Math.max(8, t - 2))}><ThemedText>-</ThemedText></TouchableOpacity>
                                        <ThemedText>Tolerance {matchTol}</ThemedText>
                                        <TouchableOpacity onPress={() => setMatchTol(t => Math.min(30, t + 2))}><ThemedText>+</ThemedText></TouchableOpacity>
                                    </View>
                                ) : null}
                                <TouchableOpacity
                                    onPress={async () => {
                                        if (photoUri) {
                                            try {
                                                if (showHeat) {
                                                    const hm = await generateBoundaryLossHeatmap(photoUri, 360);
                                                    setHeatUri(hm.overlayUri); setHeatW(hm.width); setHeatH(hm.height);
                                                }
                                                if (showRG) {
                                                    const res = await detectRedGreenRegions(photoUri, 360, 0.35, 0.008);
                                                    const regs = (res.regions || []).map(r => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, areaFrac: r.areaFrac }));
                                                    setRgRegions(regs);
                                                }
                                                if (showMatch && AInfo) {
                                                    const mm = await generateMatchMask(photoUri, AInfo.L, AInfo.a, AInfo.bLab, matchTol, 360);
                                                    setMatchUri(mm.overlayUri);
                                                }
                                            } catch { }
                                        }
                                    }}
                                    style={styles.pill}
                                >
                                    <ThemedText>Recompute</ThemedText>
                                </TouchableOpacity>
                            </View>

                            {/* Info lines */}
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

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                                <Buttons title="Share" onPress={async () => { if (!photoUri) return; try { await Share.share({ message: 'SEEiT analysis', url: photoUri }) } catch { } }} />
                                <Buttons title="Close" onPress={() => { setPhotoUri(null); setHeatUri(null); setMatchUri(null); setRgRegions([]); setA(undefined); setB(undefined); setAInfo(null); setBInfo(null); }} />
                            </View>
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
    pill: { backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    infoRow: { marginVertical: 4 },
    infoText: { fontSize: 14 },
    rgBox: { position: 'absolute', borderWidth: 2, borderRadius: 4 },
    badge: { position: 'absolute', top: -18, left: -2, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});