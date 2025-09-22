import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { DetectionOverlay } from '@/hooks/useDetectionOverlay';
import { useDetectionsNotifier } from '@/hooks/useDetectionsNotifier';
import { mlkitObjectDetect } from '@/hooks/useMlkitObject';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
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

const DEFAULT_SPEECH_ON = false

const PermissionsPage = () => (
    <ThemedView
        style={styles.center}
        accessible
        accessibilityRole="alert"
        accessibilityLabel="Camera permission required"
    >
        <ThemedText style={styles.permissionText}>
            Camera permission is required.
        </ThemedText>
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
        <ThemedView
            style={styles.center}
            accessible
            accessibilityRole="alert"
            accessibilityLabel="No camera device found"
        >
            <ThemedText style={styles.permissionText}>No camera device found.</ThemedText>
        </ThemedView>
    );
};

export default function Index() {
    React.useEffect(() => {
        let cleanup: undefined | (() => void)
        initTTS()
            .then((res) => { cleanup = res.cleanup })
            .catch((e) => console.warn('[TTS] init failed:', e))
        return () => { try { cleanup?.() } catch { } }
    }, [])

    const [screenReaderOn, setScreenReaderOn] = React.useState(false)
    React.useEffect(() => {
        AccessibilityInfo.isScreenReaderEnabled()
            .then(enabled => setScreenReaderOn(Boolean(enabled)))
            .catch(() => { })
        const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled: boolean) => {
            setScreenReaderOn(Boolean(enabled))
        })
        return () => {
            // @ts-ignore compatibility
            sub?.remove?.()
        }
    }, [])

    const [cameraPosition, setCameraPosition] = React.useState<'front' | 'back'>('back')
    const [torch, setTorch] = React.useState<'off' | 'on'>('off')
    const [speechOn, setSpeechOn] = React.useState(DEFAULT_SPEECH_ON)
    // UI improvement: start active so users see detections without having to guess to press Resume
    const [isActive, setIsActive] = React.useState(true)

    // Raw plugin objects (id, b: [x,y,w,h], labels[])
    const [objects, setObjects] = React.useState<any[]>([])
    // Plugin (upright) frame dimensions for overlay scaling
    const [frameDims, setFrameDims] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 })
    // Optional: top label/conf for overlay tag (not used by notifier)
    const [topInfo, setTopInfo] = React.useState<{ label: string; confidence: number }>({ label: '', confidence: -1 })
    // Frame processor error (surfaced to UI)
    const [fpError, setFpError] = React.useState<string | null>(null)
    const [previewSize, setPreviewSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 })

    // Overlay toggle and health timestamp
    const [showOverlay, setShowOverlay] = React.useState(true)
    const [lastDetTs, setLastDetTs] = React.useState(0)

    // Derived detection status for gating UX and speech
    const detectionStatus: 'ok' | 'warm' | 'off' = React.useMemo(() => {
        if (!isActive) return 'off'
        if (fpError) return 'off'
        const age = Date.now() - lastDetTs
        if (age < 2000) return 'ok'
        return 'warm'
    }, [isActive, fpError, lastDetTs])

    const firstSpeechActivationRef = React.useRef(true)

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
        } else {
            console.log('Camera format: (auto/undefined)');
        }
        console.log('Camera FPS:', fps);
    }, [format, fps]);

    // Receive plugin result map on JS and fan out to state
    const setPluginResultOnJS = Worklets.useRunOnJS((raw: any) => {
        if (!raw || typeof raw.detSeq !== 'number') return
        if (raw.detSeq < 0) return

        // health should advance ONLY when we have run at least one detection
        if (raw.detSeq > 0) {
            setLastDetTs(Date.now())
        }

        try {
            console.log('[FP]', 'detSeq=', raw.detSeq, 'objs=', Array.isArray(raw.objs) ? raw.objs.length : -1, 'dims=', raw.width, 'x', raw.height)
        } catch { }
        setFpError(null)

        const objs = Array.isArray(raw.objs) ? raw.objs : []
        setObjects(objs)
        setFrameDims({
            width: typeof raw.width === 'number' ? raw.width : 0,
            height: typeof raw.height === 'number' ? raw.height : 0,
        })
        setTopInfo({
            label: typeof raw.topLabel === 'string' ? raw.topLabel : '',
            confidence: typeof raw.topConfidence === 'number' ? raw.topConfidence : -1,
        })
    }, [])

    const setPluginErrorOnJS = Worklets.useRunOnJS((msg: string) => {
        setFpError(msg)
    }, [])

    const frameProcessor = useFrameProcessor((frame) => {
        'worklet';
        try {
            const result = mlkitObjectDetect(frame) as any
            if (result && typeof result.detSeq === 'number') {
                setPluginResultOnJS(result)
            } else {
                setPluginErrorOnJS('Plugin result missing detSeq')
            }
        } catch (e: any) {
            setPluginErrorOnJS(String(e?.message ?? 'plugin call failed'))
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
            ttsStop().catch(() => { })
        }
    }, [speechOn, isActive])

    const notifyDetections = useDetectionsNotifier({
        enabled: speechOn && isActive && detectionStatus === 'ok',
        useTTS: !screenReaderOn,
        stableFrames: 3,
        minConfidence: 0.5,
        perObjectCooldownMs: 5000,
        globalCooldownMs: 1200,
        includeConfidenceInMessage: false,
        summarizeMultiple: false,
        allowUnlabeled: false,
        numbering: true,
        numberFormat: 'words',
        numberingResetMs: 6000,
        labelHoldMs: 3000,
        minScoreDeltaToSwitch: 0.12,
        iouThresholdForCluster: 0.2,
        labelMap: {
            'home good': 'household item',
            'fashion good': 'clothing item',
        },
        speakTTS: (text: string) => ttsSpeak(text),
        announceA11y: (msg: string) => AccessibilityInfo.announceForAccessibility(msg),
    })

    // Adapt plugin objects -> DetectionObject[] shape for the notifier
    React.useEffect(() => {
        const dets = (objects ?? []).map((o: any) => {
            const top = (Array.isArray(o.labels) && o.labels.length > 0) ? o.labels[0] : null
            const b = Array.isArray(o.b) ? o.b : []
            const norm = (b.length === 4)
                ? { x: b[0] as number, y: b[1] as number, width: b[2] as number, height: b[3] as number }
                : undefined
            return {
                id: o.id,
                label: top?.name,
                score: typeof top?.c === 'number' ? top.c : undefined,
                norm,
            }
        })
        notifyDetections(dets)
    }, [objects, notifyDetections])

    if (!hasPermission) return <PermissionsPage />
    if (!device) return <NoCameraDeviceError />

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
            const next = !prev
            if (next) {
                if (!screenReaderOn) {
                    if (firstSpeechActivationRef.current) {
                        firstSpeechActivationRef.current = false
                        ttsSpeak('Speech feature enabled.').catch(() => { })
                    } else {
                        ttsSpeak('Speech on.').catch(() => { })
                    }
                } else {
                    AccessibilityInfo.announceForAccessibility('Speech on')
                }
            } else {
                ttsStop().catch(() => { })
                AccessibilityInfo.announceForAccessibility('Speech off')
            }
            return next
        })
    }

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

    const mainButtonLabel = isActive ? 'Pause live view' : 'Resume live view';
    const torchDisabled = !isActive || !supportsTorch;
    const flipDisabled = false;

    // const formatInfo = format
    //     ? `${format.videoWidth}x${format.videoHeight} @ ${fps ?? 'auto'} FPS`
    //     : 'auto format';

    const statusColor = detectionStatus === 'ok' ? '#9cff9c' : detectionStatus === 'warm' ? '#ffd27a' : '#ff9c9c'
    const statusText = detectionStatus === 'ok' ? 'Detection: OK' : detectionStatus === 'warm' ? 'Detection: Warming…' : 'Detection: Off'

    const objCount = objects?.length ?? 0

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: themeColors.background }]}
            accessible={false}
        >
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
                {/* HUD: overlay toggle + detection status + object count */}
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

                {/* <View
                    style={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        zIndex: 10,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                    }}
                >
                    <Text style={{ color: 'white', fontSize: 12 }}>{formatInfo}</Text>
                </View> */}
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
                        // topLabel={topInfo.label}
                        // topConfidence={topInfo.confidence}
                    />
                )}
                {fpError ? (
                    <View style={{ position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(255,0,0,0.35)', padding: 6, borderRadius: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 12 }}>Detection error: {fpError}</Text>
                    </View>
                ) : null}
            </View>

            <View
                style={styles.upperRow}
                accessible
                accessibilityLabel="Camera controls row"
            >
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
                        disabled: torchDisabled,
                        checked: supportsTorch ? torch === 'on' : undefined,
                    }}
                    disabled={torchDisabled}
                    containerStyle={{ alignSelf: 'center' }}
                />
                <Buttons
                    iconName="camera-reverse-outline"
                    onPress={toggleCameraPosition}
                    accessibilityLabel="Switch camera"
                    accessibilityHint={`Currently ${cameraPosition === 'back' ? 'rear' : 'front'} camera active`}
                    accessibilityState={{ disabled: flipDisabled }}
                    disabled={flipDisabled}
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
                    accessibilityLabel={mainButtonLabel}
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
    mainAction: {
        width: 110,
        height: 110,
        borderRadius: 55,
        alignItems: 'center',
        justifyContent: 'center',
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