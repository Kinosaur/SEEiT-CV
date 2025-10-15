import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { detectConfusableColors } from '@/hooks/ProtanTools';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { computeContainedRect } from '@/utils/containedRect';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { AccessibilityInfo, ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraPermission } from 'react-native-vision-camera';

type ConfLevel = 'low' | 'med' | 'high';

type ConfRegion = {
    type: string;
    mode: 'protan' | 'deutan' | 'general';
    riskFor: 'protan' | 'deutan' | 'both';
    trueFamily: string;
    dominantFamily?: string;
    meanR: number; meanG: number; meanB: number;
    meanProtanR?: number; meanProtanG?: number; meanProtanB?: number;
    meanDeutanR?: number; meanDeutanG?: number; meanDeutanB?: number;
    simFamilyProtan?: string;
    simFamilyDeutan?: string;
    avgDeltaEProtan?: number;
    avgDeltaEDeutan?: number;
    confProtan?: ConfLevel;
    confDeutan?: ConfLevel;
    x: number; y: number; w: number; h: number; areaFrac: number;
}

const CF_MIN_AREA_FRAC = 0.0035;
const CF_MIN_SAT = 0.25;
const CF_MIN_VAL = 0.15;

// Label sizing guards
const MIN_LABEL_AREA_FRAC = 0.006;
const MIN_LABEL_PX_W = 56;
const MIN_LABEL_PX_H = 24;

type LabelMode = 'numbers' | 'names' | 'off';

export default function ColorBlindCameraScreen() {
    const [cameraPosition] = React.useState<'back' | 'front'>('back');
    const { device, format, fps } = useSimpleFormat(cameraPosition);
    const cameraRef = React.useRef<Camera>(null);
    const { hasPermission, requestPermission } = useCameraPermission();

    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const navigation = useNavigation<DrawerNavigationProp<any>>();
    const insets = useSafeAreaInsets();

    const dynamicStyles = React.useMemo(() => createDynamicStyles(theme), [theme]);

    const [photoUri, setPhotoUri] = React.useState<string | null>(null);
    const [imgW, setImgW] = React.useState(0);
    const [imgH, setImgH] = React.useState(0);
    const [processing, setProcessing] = React.useState(false);
    const [analyzing, setAnalyzing] = React.useState(false);

    const [confMode, setConfMode] = React.useState<'protan' | 'deutan' | 'both'>('both');
    const [confRegions, setConfRegions] = React.useState<ConfRegion[]>([]);
    const [showLowConf, setShowLowConf] = React.useState(false);
    const [labelMode, setLabelMode] = React.useState<LabelMode>('numbers');

    const [containerW, setContainerW] = React.useState(0);
    const [containerH, setContainerH] = React.useState(0);
    const [footerH, setFooterH] = React.useState(0);

    const imageRect = React.useMemo(
        () => computeContainedRect(containerW, containerH, imgW, imgH),
        [containerW, containerH, imgW, imgH]
    );

    React.useEffect(() => {
        if (!hasPermission) requestPermission().catch(() => { });
    }, [hasPermission, requestPermission]);

    React.useEffect(() => {
        AccessibilityInfo.announceForAccessibility?.(
            `Mode set to ${confMode === 'both' ? 'Both' : confMode === 'protan' ? 'Protan' : 'Deutan'}.`
        );
    }, [confMode]);

    const ensureFileUri = React.useCallback(async (uri: string): Promise<string> => {
        if (uri.startsWith('file://')) return uri;
        try {
            const extGuess = uri.includes('.') ? uri.substring(uri.lastIndexOf('.')) : '.jpg';
            const dest = `${FileSystem.cacheDirectory}import_${Date.now()}${extGuess}`;
            await FileSystem.copyAsync({ from: uri, to: dest });
            return dest;
        } catch {
            try {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
                const dest = `${FileSystem.cacheDirectory}import_${Date.now()}.jpg`;
                await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
                return dest;
            } catch {
                return uri;
            }
        }
    }, []);

    const requestMediaPermission = React.useCallback(async (): Promise<boolean> => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        return status === 'granted';
    }, []);

    const pickOneImage = React.useCallback(async (): Promise<string | null> => {
        if (Platform.OS === 'android') {
            try {
                const pending = await ImagePicker.getPendingResultAsync();
                if (pending && 'canceled' in pending && pending.canceled === false && Array.isArray(pending.assets) && pending.assets.length > 0) {
                    return pending.assets[0].uri;
                }
            } catch { }
        }
        const runPicker = async (legacy: boolean) => {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsMultipleSelection: false,
                quality: 1,
                exif: false,
                ...(Platform.OS === 'android' ? { legacy } as const : {}),
            });
            if (res.canceled || !res.assets?.length) return null;
            return res.assets[0].uri;
        };
        try {
            return await runPicker(false);
        } catch (e: any) {
            const msg = String(e?.message ?? e);
            const needsLegacy = /imageLibraryLauncher has not been initialized/i.test(msg);
            if (Platform.OS === 'android' && needsLegacy) return await runPicker(true);
            throw e;
        }
    }, []);

    const runConfusions = React.useCallback(async (uri: string, mode: 'protan' | 'deutan' | 'both') => {
        const res = await detectConfusableColors(uri, 360, mode, CF_MIN_AREA_FRAC, CF_MIN_SAT, CF_MIN_VAL);
        let filtered = (res.regions ?? []) as ConfRegion[];

        // STRICT: only show high-confidence by default
        if (!showLowConf) {
            filtered = filtered.filter(r => {
                if (mode === 'protan') return r.confProtan === 'high';
                if (mode === 'deutan') return r.confDeutan === 'high';
                return (r.confProtan === 'high') || (r.confDeutan === 'high');
            });
        }

        filtered = filtered.filter(r => mode === 'both'
            ? (r.riskFor === 'both' || r.riskFor === 'protan' || r.riskFor === 'deutan')
            : r.riskFor === mode || r.riskFor === 'both'
        );

        filtered.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

        setConfRegions(filtered);
        setImgW(res.width || 0);
        setImgH(res.height || 0);

        AccessibilityInfo.announceForAccessibility?.(
            filtered.length === 0
                ? 'No high-confidence regions detected for this mode.'
                : `Detected ${filtered.length} high-confidence region${filtered.length === 1 ? '' : 's'}.`
        );

        return res;
    }, [showLowConf]);

    const rerunIfPossible = React.useCallback(async () => {
        if (photoUri) {
            try { await runConfusions(photoUri, confMode); } catch { }
        }
    }, [photoUri, confMode, runConfusions]);

    React.useEffect(() => { void rerunIfPossible(); }, [showLowConf, labelMode, rerunIfPossible]);

    const toggleShowLowConf = React.useCallback(() => {
        setShowLowConf(prev => !prev);
        AccessibilityInfo.announceForAccessibility?.('Toggled low confidence regions');
    }, []);

    React.useEffect(() => {
        (async () => {
            if (!photoUri) return;
            try {
                await runConfusions(photoUri, confMode);
            } catch {
                setConfRegions([]);
            }
        })();
    }, [photoUri, confMode, runConfusions]);

    // Import and analyze flow
    const importAndAnalyze = React.useCallback(async () => {
        try {
            setProcessing(true);
            const ok = await requestMediaPermission();
            if (!ok) {
                AccessibilityInfo.announceForAccessibility?.('Media library permission is required to import an image.');
                setProcessing(false);
                return;
            }
            const pickedUri = await pickOneImage();
            if (!pickedUri) { setProcessing(false); return; }
            const fileUri = await ensureFileUri(pickedUri);
            setPhotoUri(fileUri);
            setConfRegions([]);
            const res = await runConfusions(fileUri, confMode);
            setImgW(res.width || 0);
            setImgH(res.height || 0);
        } catch (e) {
            console.warn('[Import] failed:', e);
        } finally {
            setProcessing(false);
        }
    }, [requestMediaPermission, pickOneImage, ensureFileUri, runConfusions, confMode]);

    // Capture and analyze flow
    const captureAndAnalyze = React.useCallback(async () => {
        if (!cameraRef.current) return;
        try {
            setAnalyzing(true);
            const file = await cameraRef.current.takePhoto({ flash: 'off' });
            const rawPath = (file as any)?.path as string | undefined;
            if (!rawPath) throw new Error('No photo path returned');
            const fileUri = rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;
            AccessibilityInfo.announceForAccessibility?.('Photo captured. Analyzing…');

            setPhotoUri(fileUri);
            setConfRegions([]);
            const res = await runConfusions(fileUri, confMode);
            setImgW(res.width || 0);
            setImgH(res.height || 0);
            AccessibilityInfo.announceForAccessibility?.('Analysis complete.');
        } catch (e) {
            console.warn('[Capture] failed:', e);
            AccessibilityInfo.announceForAccessibility?.('Capture failed.');
        } finally {
            setAnalyzing(false);
        }
    }, [cameraRef, runConfusions, confMode]);

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

    const mapBox = (r: { x: number; y: number; w: number; h: number }) => {
        const { left, top, width, height } = imageRect;
        return {
            left: left + r.x * width,
            top: top + r.y * height,
            width: r.w * width,
            height: r.h * height,
        };
    };

    const overlayStyle = { borderColor: `${theme.text}F2`, backgroundColor: `${theme.surface}1A`, borderStyle: 'solid' as const };

    const confTag = (level?: ConfLevel) => (level ? ` (${level})` : '');

    const buildPillLabel = (cr: ConfRegion): string => {
        const dom = cr.dominantFamily || cr.trueFamily || '';
        if (confMode === 'both') return dom;
        const sim = confMode === 'protan' ? (cr.simFamilyProtan || '') : (cr.simFamilyDeutan || '');
        const conf = confMode === 'protan' ? cr.confProtan : cr.confDeutan;
        if (!sim || conf === 'low') return dom;
        const mark = conf === 'high' ? ' ↑' : '';
        return `${dom} → ${sim}${mark}`;
    };

    const Line = ({ label, swatch, text }: { label: string; swatch: string; text: string }) => (
        <View style={styles.lineRow}>
            <ThemedText style={styles.lineLabel}>{label}</ThemedText>
            <View style={[dynamicStyles.swatch, { backgroundColor: swatch }]} />
            <ThemedText style={styles.lineText} numberOfLines={1}>{text}</ThemedText>
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} accessible={false}>
            <TouchableOpacity
                style={styles.drawerToggle}
                onPress={() => navigation.toggleDrawer()}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Open navigation drawer"
            >
                <Ionicons name="menu" size={32} color={theme.text} />
            </TouchableOpacity>

            <View style={styles.headerRow} accessible accessibilityLabel="Color Finder header">
                <ThemedText style={styles.title}>Color Finder</ThemedText>
            </View>

            <View style={styles.previewWrapper} accessible accessibilityLabel="Live camera preview">
                <Camera
                    ref={cameraRef}
                    style={{ flex: 1 }}
                    device={device}
                    isActive={true}
                    resizeMode="cover"
                    photo={true}
                    androidPreviewViewType="texture-view"
                    {...(format ? { format } : {})}
                    {...(format && fps ? { fps } : {})}
                />
                {analyzing && (
                    <View style={dynamicStyles.analyzingOverlay} pointerEvents="none" accessibilityElementsHidden>
                        <ActivityIndicator color={theme.text} size="large" />
                        <ThemedText style={dynamicStyles.analyzingText}>Analyzing…</ThemedText>
                    </View>
                )}
            </View>

            <View style={styles.controlsRow}>
                <TouchableOpacity
                    onPress={() => setConfMode(m => (m === 'both' ? 'protan' : m === 'protan' ? 'deutan' : 'both'))}
                    style={dynamicStyles.pill}
                    accessibilityRole="button"
                    accessibilityLabel="Switch colorblind mode"
                    accessibilityHint="Cycles between Both, Protan, and Deutan"
                    disabled={analyzing || processing}
                >
                    <ThemedText>Mode: {confMode === 'both' ? 'Both' : confMode === 'protan' ? 'Protan' : 'Deutan'}</ThemedText>
                </TouchableOpacity>

                <Buttons
                    onPress={captureAndAnalyze}
                    accessibilityLabel="Capture and analyze"
                    circular
                    size={72}
                    variant="primary"
                    iconName="camera"
                    iconPosition="only"
                    disabled={analyzing || processing}
                />

                <Buttons
                    onPress={importAndAnalyze}
                    accessibilityLabel="Import image for analysis"
                    circular
                    size={52}
                    variant="surface"
                    iconName="image-outline"
                    iconPosition="only"
                    containerStyle={{ marginRight: 12 }}
                    disabled={processing || analyzing}
                />
            </View>

            <Modal
                visible={!!photoUri}
                transparent={false}
                animationType="slide"
                onRequestClose={() => {
                    setPhotoUri(null);
                    setConfRegions([]);
                    setImgW(0); setImgH(0);
                }}
            >
                <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                    <View style={{ flex: 1 }}>
                        <View
                            style={{ width: '100%', height: '62%', justifyContent: 'center', alignItems: 'center' }}
                            onLayout={e => {
                                const { width, height } = e.nativeEvent.layout;
                                setContainerW(width); setContainerH(height);
                            }}
                        >
                            {photoUri ? (
                                <View style={{ width: '100%', height: '100%' }} accessible accessibilityLabel="Analyzed image">
                                    <Image source={{ uri: photoUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
                                    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                                        {confRegions.map((cr, idx) => {
                                            const box = mapBox(cr);
                                            const pillText = buildPillLabel(cr);
                                            const tooSmallByArea = cr.areaFrac < MIN_LABEL_AREA_FRAC;
                                            const tooSmallByPx = box.width < MIN_LABEL_PX_W || box.height < MIN_LABEL_PX_H;
                                            const canShowNamePill = !(tooSmallByArea || tooSmallByPx);

                                            return (
                                                <View
                                                    key={`cf-${idx}`}
                                                    style={[styles.confBox, overlayStyle, { left: box.left, top: box.top, width: box.width, height: box.height }]}
                                                >
                                                    {labelMode === 'names' && canShowNamePill && (
                                                        <View style={dynamicStyles.labelPill}>
                                                            <ThemedText style={dynamicStyles.labelText} numberOfLines={1}>{pillText}</ThemedText>
                                                        </View>
                                                    )}
                                                    {labelMode === 'numbers' && (
                                                        <View style={dynamicStyles.smallBadge}>
                                                            <ThemedText style={dynamicStyles.indexBadgeText}>{idx + 1}</ThemedText>
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            ) : null}
                        </View>

                        <View style={styles.modalControlsRow} accessible accessibilityRole="toolbar">
                            <TouchableOpacity
                                onPress={toggleShowLowConf}
                                style={[dynamicStyles.pill, showLowConf && dynamicStyles.pillActive]}
                                accessibilityRole="button"
                                accessibilityLabel={showLowConf ? 'Hide low confidence regions' : 'Show low confidence regions'}
                            >
                                <ThemedText>{showLowConf ? 'Hide low-conf' : 'Show low-conf'}</ThemedText>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setLabelMode(m => m === 'numbers' ? 'names' : m === 'names' ? 'off' : 'numbers')}
                                style={[dynamicStyles.pill, labelMode !== 'off' && dynamicStyles.pillActive]}
                                accessibilityRole="button"
                                accessibilityLabel="Toggle label mode"
                                accessibilityHint="Cycles Numbers, Names, Off"
                            >
                                <ThemedText>Labels: {labelMode === 'numbers' ? 'Numbers' : labelMode === 'names' ? 'Names' : 'Off'}</ThemedText>
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: footerH + insets.bottom + 24 }}
                            showsVerticalScrollIndicator
                        >
                            <ThemedText style={[styles.legendHeader, { color: theme.text }]}>
                                Regions: {confRegions.length} • Mode: {confMode === 'both' ? 'Both' : confMode === 'protan' ? 'Protan' : 'Deutan'}
                            </ThemedText>

                            {confRegions.map((cr, idx) => {
                                const trueSw = `rgb(${cr.meanR},${cr.meanG},${cr.meanB})`;
                                const showProtan = confMode !== 'deutan';
                                const showDeutan = confMode !== 'protan';
                                const protSw = cr.meanProtanR != null ? `rgb(${cr.meanProtanR},${cr.meanProtanG},${cr.meanProtanB})` : 'transparent';
                                const deutSw = cr.meanDeutanR != null ? `rgb(${cr.meanDeutanR},${cr.meanDeutanG},${cr.meanDeutanB})` : 'transparent';

                                return (
                                    <View key={`legend-${idx}`} style={[styles.legendCard, { borderColor: theme.divider }]}>
                                        <View style={styles.cardHeader}>
                                            <View style={dynamicStyles.indexBadge}><ThemedText style={dynamicStyles.indexBadgeText}>{idx + 1}</ThemedText></View>
                                            <ThemedText style={styles.cardTitle}>Region {idx + 1}</ThemedText>
                                        </View>

                                        <Line label="True" swatch={trueSw} text={(cr.dominantFamily || cr.trueFamily || '—')} />

                                        {showProtan && (
                                            <Line label="Protan" swatch={protSw} text={`${cr.simFamilyProtan || '—'}${confTag(cr.confProtan)}`} />
                                        )}
                                        {showDeutan && (
                                            <Line label="Deutan" swatch={deutSw} text={`${cr.simFamilyDeutan || '—'}${confTag(cr.confDeutan)}`} />
                                        )}
                                    </View>
                                );
                            })}

                            {confRegions.length === 0 && (
                                <ThemedText style={{ opacity: 0.7, marginTop: 8 }}>
                                    No confident regions detected for this mode.
                                </ThemedText>
                            )}
                        </ScrollView>

                        <View
                            style={[styles.footerBar, { backgroundColor: theme.background, borderTopColor: theme.divider }]}
                            onLayout={e => setFooterH(e.nativeEvent.layout.height)}
                        >
                            <Buttons
                                title="Close"
                                iconName="close"
                                onPress={() => { setPhotoUri(null); setConfRegions([]); setImgW(0); setImgH(0); }}
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

const createDynamicStyles = (theme: typeof Colors.light) => StyleSheet.create({
    analyzingOverlay: {
        position: 'absolute',
        left: 0, right: 0, top: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${theme.surface}66`,
    },
    analyzingText: {
        marginTop: 8,
        color: theme.text,
        fontSize: 16,
        fontFamily: 'AtkinsonBold',
    },
    labelPill: {
        position: 'absolute',
        top: -22,
        left: -2,
        backgroundColor: `${theme.surface}CC`,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        maxWidth: 200
    },
    labelText: { color: theme.text, fontSize: 12, fontWeight: '700' },
    smallBadge: {
        position: 'absolute',
        top: -10,
        left: -10,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: theme.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indexBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: theme.accent,
        alignItems: 'center',
        justifyContent: 'center'
    },
    indexBadgeText: { color: theme.background, fontSize: 12, fontWeight: '700' },
    swatch: {
        width: 18,
        height: 12,
        borderRadius: 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: `${theme.divider}80`
    },
    pill: {
        backgroundColor: `${theme.surface}99`,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6
    },
    pillActive: { backgroundColor: `${theme.surface}CC` },
});

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: Platform.OS === 'android' ? 20 : 0 },
    drawerToggle: { position: 'absolute', top: Platform.OS === 'android' ? 40 : 10, right: 10, zIndex: 10, padding: 8, borderRadius: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 2, marginBottom: 10 },
    title: { fontFamily: 'AtkinsonBold', fontSize: 22, textAlign: 'center' },
    previewWrapper: { flex: 1, borderRadius: 10, overflow: 'hidden', marginHorizontal: 12, marginBottom: 12 },
    // Add more side padding so rightmost button isn’t hugging the edge
    controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },

    center: { flex: 1, justifyContent: 'center', padding: 32 },
    permissionText: { fontSize: 20, fontFamily: 'AtkinsonBold', textAlign: 'center' },
    confBox: { position: 'absolute', borderWidth: 2, borderRadius: 4 },



    modalControlsRow: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 0, flexDirection: 'row', gap: 10, alignItems: 'center' },

    legendHeader: { fontFamily: 'AtkinsonBold', fontSize: 14, marginBottom: 8 },
    legendCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, marginBottom: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    cardTitle: { fontSize: 14, fontFamily: 'AtkinsonBold' },

    lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
    lineLabel: { width: 58, fontFamily: 'AtkinsonBold' },
    lineText: { fontSize: 14, flexShrink: 1 },



    footerBar: {
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