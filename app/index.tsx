import Buttons from '@/components/Buttons';
import { OverlayDetection } from '@/components/OverlayDetection';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useDetectionsNotifier } from '@/hooks/useDetectionsNotifier';
import { detectObjects } from '@/hooks/useDetector';
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

// Permission fallback
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

// No device fallback
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
    // Initialize TTS once (Phase 1)
    React.useEffect(() => {
        let cleanup: undefined | (() => void)
        initTTS()
            .then((res) => { cleanup = res.cleanup })
            .catch((e) => console.warn('[TTS] init failed:', e))
        return () => {
            try { cleanup?.() } catch { }
        }
    }, [])

    // Screen reader gating
    const [screenReaderOn, setScreenReaderOn] = React.useState(false)
    React.useEffect(() => {
        let mounted = true
        AccessibilityInfo.isScreenReaderEnabled()
            .then((enabled) => { if (mounted) setScreenReaderOn(Boolean(enabled)) })
            .catch(() => { })
        const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled: boolean) => {
            setScreenReaderOn(Boolean(enabled))
        })
        return () => {
            // @ts-ignore RN < 0.71 compatibility
            sub?.remove?.()
        }
    }, [])

    // State: start paused & speech off
    const [cameraPosition, setCameraPosition] = React.useState<'front' | 'back'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [speechOn, setSpeechOn] = React.useState(false);
    const [isActive, setIsActive] = React.useState(false);
    const [objects, setObjects] = React.useState<any[]>([]);
    const [previewSize, setPreviewSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    const { hasPermission, requestPermission } = useCameraPermission();
    const navigation = useNavigation<DrawerNavigationProp<any>>();
    const colorScheme = useColorScheme() ?? 'light';
    const themeColors = Colors[colorScheme];

    // Simplicity-first: attempt 1080p@30 else auto
    const { device, format, fps, supportsTorch } = useSimpleFormat(cameraPosition);

    // Log camera format and FPS when they change
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

    // Memoize the JS setter to be called from worklet
    const setObjectsOnJS = Worklets.useRunOnJS((arr: any[]) => {
        setObjects(arr);
    }, []);

    // Frame Processor Worklet
    const frameProcessor = useFrameProcessor((frame) => {
        'worklet';
        // Throttle: run roughly every 120ms (~8 fps)
        const g = globalThis as any;
        const now = Date.now();
        if (g.__lastDetectTs == null) g.__lastDetectTs = 0;
        if (now - g.__lastDetectTs < 120) return;
        g.__lastDetectTs = now;

        const results = (detectObjects(frame) as unknown as any[]) ?? [];
        setObjectsOnJS(results);
    }, [setObjectsOnJS]);

    React.useEffect(() => {
        if (!hasPermission) {
            requestPermission().catch(() => { });
        }
    }, [hasPermission, requestPermission]);

    const announce = (msg: string) => {
        if (speechOn) AccessibilityInfo.announceForAccessibility(msg);
    };

    // Stop any ongoing TTS when pausing or turning speech off
    React.useEffect(() => {
        if (!speechOn || !isActive) {
            ttsStop().catch(() => { })
        }
    }, [speechOn, isActive])

    // Notifier: speak detections with TTS when SR is off; else use Accessibility announcements
    const notifyDetections = useDetectionsNotifier({
        enabled: speechOn && isActive,
        useTTS: !screenReaderOn,
        stableFrames: 3,
        minConfidence: 0.5,
        perObjectCooldownMs: 5000,
        globalCooldownMs: 1200,
        includeConfidenceInMessage: false,
        summarizeMultiple: false,
        speakTTS: (text: string) => ttsSpeak(text),
        announceA11y: (msg: string) => AccessibilityInfo.announceForAccessibility(msg),
    })

    // Feed detections into notifier when list changes
    React.useEffect(() => {
        notifyDetections(objects)
    }, [objects, notifyDetections])

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

    // Phase 1 test speech removed to avoid conflicts with detection TTS.
    const toggleSpeech = () => {
        setSpeechOn(prev => {
            const next = !prev;
            if (!next) ttsStop().catch(() => { })
            AccessibilityInfo.announceForAccessibility(next ? 'Speech on' : 'Speech off');
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

    const mainButtonLabel = isActive ? 'Pause live view' : 'Resume live view';

    const torchDisabled = !isActive || !supportsTorch;
    const flipDisabled = false;

    const formatInfo = format
        ? `${format.videoWidth}x${format.videoHeight} @ ${fps ?? 'auto'} FPS`
        : 'auto format';

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
                <View
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
                </View>
                <Camera
                    style={{ flex: 1 }}
                    device={device}
                    isActive={isActive}
                    resizeMode="cover"
                    torch={torch}
                    {...(format ? { format } : {})}
                    {...(format && fps ? { fps } : {})}
                    frameProcessor={frameProcessor}
                />
                <OverlayDetection
                    objects={objects as any}
                    previewWidth={previewSize.width}
                    previewHeight={previewSize.height}
                />
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