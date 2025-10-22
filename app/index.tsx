/**
 * Main Camera Screen - Real-time object detection with live speech feedback
 * Primary interface for the SEEiT-CV accessibility application
 */
import Buttons from '@/components/Buttons';
import { DetectionOverlay } from '@/components/DetectionOverlay';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { mlkitObjectDetect } from '@/hooks/useMlkitObject';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { initTTS } from '@/services/tts';
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
import { Camera, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import * as Worklets from 'react-native-worklets-core';

import { DEFAULT_SPEECH_ON } from '@/constants/detection';
import { useLiveDetectionsSpeech } from '@/hooks/useLiveDetectionsSpeech';
import { useSpeechChannel } from '@/hooks/useSpeechChannel';

const SPEAK_AGGREGATE_VIA_NOTIFIER = false;

// Component for handling missing camera permissions
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

// Component for handling missing camera device
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

/**
 * Main Index Component - Primary camera interface with real-time object detection
 * Provides live speech feedback for detected objects and visual overlays
 */
export default function Index() {
    // Initialize TTS service on component mount
    React.useEffect(() => {
        let cleanup: undefined | (() => void);
        initTTS()
            .then((res) => {
                cleanup = res.cleanup;
            })
            .catch((e) => console.warn('[TTS] init failed:', e));
        return () => {
            try {
                cleanup?.();
            } catch { }
        };
    }, []);

    // Camera and UI state
    const [cameraPosition, setCameraPosition] = React.useState<'front' | 'back'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [speechOn, setSpeechOn] = React.useState(DEFAULT_SPEECH_ON);

    // Start paused on app open
    const [isActive, setIsActive] = React.useState(false);

    const [objects, setObjects] = React.useState<any[]>([]);
    const [frameDims, setFrameDims] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [fpError, setFpError] = React.useState<string | null>(null);
    const [previewSize, setPreviewSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    const [showOverlay, setShowOverlay] = React.useState(true);
    const [lastDetTs, setLastDetTs] = React.useState(0);

    const detectionStatus: 'ok' | 'warm' | 'off' = React.useMemo(() => {
        if (!isActive) return 'off';
        if (fpError) return 'off';
        return Date.now() - lastDetTs < 2000 ? 'ok' : 'warm';
    }, [isActive, fpError, lastDetTs]);

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

    const frameProcessor = useFrameProcessor(
        (frame) => {
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
        },
        [setPluginResultOnJS, setPluginErrorOnJS]
    );

    React.useEffect(() => {
        if (!hasPermission) {
            requestPermission().catch(() => { });
        }
    }, [hasPermission, requestPermission]);

    const announce = (msg: string) => {
        if (speechOn) AccessibilityInfo.announceForAccessibility(msg);
    };

    // No-op notifier; full notifier hookup removed as it was unused
    const noopNotify = React.useCallback(() => { }, []);

    const { requestSpeak } = useSpeechChannel({
        active: speechOn && isActive && detectionStatus === 'ok',
        speakAggregateViaNotifier: SPEAK_AGGREGATE_VIA_NOTIFIER,
        notifyDetections: noopNotify,
    });

    useLiveDetectionsSpeech({
        enabled: speechOn && detectionStatus === 'ok',
        objects,
        requestSpeak,
    });

    if (!hasPermission) return <PermissionsPage />;
    if (!device) return <NoCameraDeviceError />;

    const toggleActive = () => {
        setIsActive((prev) => {
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
        setTorch((t) => {
            const next = t === 'off' ? 'on' : 'off';
            announce(next === 'on' ? 'Torch on' : 'Torch off');
            return next;
        });
    };

    const toggleSpeech = () => {
        setSpeechOn((prev) => {
            const next = !prev;
            AccessibilityInfo.announceForAccessibility(next ? 'Speech on' : 'Speech off');
            return next;
        });
    };

    const toggleCameraPosition = () => {
        setCameraPosition((p) => {
            const next = p === 'back' ? 'front' : 'back';
            announce(next === 'front' ? 'Front camera active' : 'Rear camera active');
            if (torch === 'on' && device?.hasTorch === false) {
                setTorch('off');
            }
            return next;
        });
    };

    const statusColor = detectionStatus === 'ok' ? themeColors.success : detectionStatus === 'warm' ? themeColors.warning : themeColors.error;
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
                        onPress={() => setShowOverlay((v) => !v)}
                        style={{ backgroundColor: `${themeColors.surface}CC`, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: showOverlay }}
                        accessibilityLabel="Toggle detection overlay"
                    >
                        <Text style={{ color: themeColors.text, fontSize: 14 }}>{showOverlay ? 'Overlay: On' : 'Overlay: Off'}</Text>
                    </TouchableOpacity>
                    <View style={{ backgroundColor: `${themeColors.surface}CC`, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}>
                        <Text style={{ color: statusColor, fontSize: 14 }}>{statusText}</Text>
                    </View>
                    <View style={{ backgroundColor: `${themeColors.surface}CC`, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}>
                        <Text style={{ color: themeColors.text, fontSize: 14 }}>Objs: {objCount}</Text>
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
                    <View style={{ position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: `${themeColors.error}88`, padding: 6, borderRadius: 4 }}>
                        <Text style={{ color: themeColors.text, fontSize: 12 }}>Detection error: {fpError}</Text>
                    </View>
                ) : null}
            </View>

            <View style={styles.upperRow} accessible accessibilityLabel="Camera controls row">
                <Buttons
                    iconName={supportsTorch ? (torch === 'on' ? 'flashlight' : 'flashlight-outline') : 'flash-off-outline'}
                    onPress={toggleTorch}
                    accessibilityLabel={supportsTorch ? (torch === 'on' ? 'Turn torch off' : 'Turn torch on') : 'Torch unavailable'}
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
                    onPress={() => AccessibilityInfo.announceForAccessibility('Language selection feature coming soon')}
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