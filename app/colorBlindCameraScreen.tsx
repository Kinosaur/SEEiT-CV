import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { COLOR_BLINDNESS_MAP } from '@/constants/colorBlindness';
import { Colors } from '@/constants/Colors';
import { useColorBlindness } from '@/context/ColorBlindnessContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSimpleFormat } from '@/hooks/useSimpleFormat';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import {
    AccessibilityInfo,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraPermission } from 'react-native-vision-camera';

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
    </ThemedView>
);

const NoCameraDeviceError = () => (
    <ThemedView
        style={styles.center}
        accessible
        accessibilityRole="alert"
        accessibilityLabel="No camera device found"
    >
        <ThemedText style={styles.permissionText}>No camera device found.</ThemedText>
    </ThemedView>
);

export default function ColorBlindCameraScreen() {
    // Back camera only for now
    const [cameraPosition] = React.useState<'back' | 'front'>('back');
    const [torch, setTorch] = React.useState<'off' | 'on'>('off');
    const [isActive, setIsActive] = React.useState(true);

    const { hasPermission, requestPermission } = useCameraPermission();
    const colorScheme = useColorScheme() ?? 'light';
    const themeColors = Colors[colorScheme];
    const navigation = useNavigation<DrawerNavigationProp<any>>();

    const { selectedType, loading: cbLoading, valid } = useColorBlindness();
    const hasRedirectedRef = React.useRef(false);

    const { device, format, fps, supportsTorch } = useSimpleFormat(cameraPosition);

    React.useEffect(() => {
        if (!hasPermission) requestPermission().catch(() => { });
    }, [hasPermission, requestPermission]);

    React.useEffect(() => {
        if (cbLoading) return;
        if (!valid && !hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            // @ts-ignore
            navigation.navigate('colorBlindnessSelect');
            AccessibilityInfo.announceForAccessibility?.(
                'Please select your color blindness type first.'
            );
        }
    }, [valid, cbLoading, navigation]);

    if (!hasPermission) return <PermissionsPage />;
    if (!device) return <NoCameraDeviceError />;

    const torchDisabled = !isActive || !supportsTorch;

    const toggleActive = () => {
        setIsActive(prev => {
            const next = !prev;
            if (!next && torch === 'on') setTorch('off');
            return next;
        });
    };

    const toggleTorch = () => {
        if (torchDisabled) return;
        setTorch(t => (t === 'off' ? 'on' : 'off'));
    };

    const currentTypeDef = selectedType ? COLOR_BLINDNESS_MAP[selectedType] : null;

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
                style={styles.headerRow}
                accessible
                accessibilityLabel="Color blind camera header"
            >
                <ThemedText style={styles.title}>Color Blind Camera</ThemedText>
            </View>

            <View
                style={styles.previewWrapper}
                accessible
                accessibilityLabel={`Live camera preview (${isActive ? 'running' : 'paused'})`}
                accessibilityHint="Use the large round button below to pause or resume."
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
                {/* Future: apply filter/overlay based on currentTypeDef */}
            </View>

            <View
                style={[styles.infoBar, { backgroundColor: themeColors.surface, borderColor: themeColors.divider }]}
                accessible
                accessibilityRole="summary"
                accessibilityLabel={
                    currentTypeDef
                        ? `Current color blindness type ${currentTypeDef.name}`
                        : 'No color blindness type selected'
                }
            >
                <View style={styles.typeTextWrapper} accessible accessibilityLabel={currentTypeDef ? `Selected type ${currentTypeDef.name}` : 'Type not selected'}>
                    <ThemedText
                        style={[styles.infoText, { color: themeColors.text }]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                    >
                        {currentTypeDef
                            ? `Type: ${currentTypeDef.name}`
                            : 'Type not selected'}
                    </ThemedText>
                </View>
                <Buttons
                    title="Change"
                    onPress={() => {
                        // @ts-ignore
                        navigation.navigate('colorBlindnessSelect');
                    }}
                    accessibilityLabel="Change color blindness type"
                    containerStyle={styles.changeButton}
                    variant="outline"
                    size="sm"
                />
            </View>

            <View
                style={styles.lowerRow}
                accessible
                accessibilityLabel="Camera control row"
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
                    circular
                    size="lg"
                    variant={torch === 'on' ? 'primary' : 'surface'}
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
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 20 : 0,
    },
    drawerToggle: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 40 : 10,
        right: 10,
        zIndex: 10,
        padding: 8,
        borderRadius: 20,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 2,
        marginBottom: 10,
    },
    title: {
        fontFamily: 'AtkinsonBold',
        fontSize: 22,
        textAlign: 'center',
    },
    previewWrapper: {
        flex: 2,
        borderRadius: 10,
        overflow: 'hidden',
        marginHorizontal: 12,
    },
    infoBar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginTop: 8,
        marginBottom: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderRadius: 12,
        justifyContent: 'space-between',
    },
    typeTextWrapper: {
        flex: 1,
        paddingRight: 8,
    },
    infoText: {
        fontFamily: 'AtkinsonBold',
        fontSize: 20,
    },
    changeButton: {
        marginLeft: 12,
        flexShrink: 0,
    },
    lowerRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingVertical: 16,
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