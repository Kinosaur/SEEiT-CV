import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import {
    AccessibilityInfo,
    Alert,
    Linking,
    Platform,
    TouchableOpacity as RNTouchableOpacity,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Camera,
    useCameraPermission,
} from 'react-native-vision-camera';

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
    // State: start paused & speech off
    const [cameraPosition, setCameraPosition] = React.useState<'front' | 'back'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [speechOn, setSpeechOn] = React.useState(false);
    const [isActive, setIsActive] = React.useState(false);

    const { hasPermission, requestPermission } = useCameraPermission();
    const navigation = useNavigation<DrawerNavigationProp<any>>();
    const colorScheme = useColorScheme() ?? 'light';
    const themeColors = Colors[colorScheme];

    // Simplicity-first: attempt 1080p@30 else auto
    const { device, format, fps, supportsTorch } = useSimpleFormat(cameraPosition);

    React.useEffect(() => {
        if (!hasPermission) {
            requestPermission().catch(() => { });
        }
    }, [hasPermission, requestPermission]);

    const announce = (msg: string) => {
        if (speechOn) AccessibilityInfo.announceForAccessibility(msg);
    };

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
            // Torch disabled in paused state (UI enforces, but guard anyway)
            announce('Cannot toggle torch while live view is paused');
            return;
        }
        setTorch(t => {
            const next = t === 'off' ? 'on' : 'off';
            announce(next === 'on' ? 'Torch on' : 'Torch off');
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

    const toggleSpeech = () => {
        setSpeechOn(prev => {
            const next = !prev;
            AccessibilityInfo.announceForAccessibility(next ? 'Speech on' : 'Speech off');
            return next;
        });
    };

    const mainButtonLabel = isActive ? 'Pause live view' : 'Resume live view';

    // Pattern A: disable only torch when paused; keep camera flip usable
    const torchDisabled = !isActive || !supportsTorch;
    const flipDisabled = false;

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
            >
                <Camera
                    style={{ flex: 1 }}
                    device={device}
                    isActive={isActive}
                    resizeMode="cover"
                    torch={torch}
                    {...(format ? { format } : {})}
                    {...(format && fps ? { fps } : {})}
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
                <RNTouchableOpacity
                    onPress={toggleActive}
                    style={[
                        styles.mainAction,
                        {
                            backgroundColor: isActive
                                ? themeColors.shutter
                                : themeColors.secondaryAccent,
                        },
                    ]}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={mainButtonLabel}
                    accessibilityState={{ checked: isActive }}
                    accessibilityHint="Toggles live camera feed."
                >
                    <ThemedText
                        style={{
                            fontFamily: 'AtkinsonBold',
                            fontSize: 18,
                            color: themeColors.background,
                        }}
                    >
                        {isActive ? 'Pause' : 'Resume'}
                    </ThemedText>
                </RNTouchableOpacity>
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