import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import * as ExpoMediaLibrary from 'expo-media-library';
import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

// Accessible permission error component
const PermissionsPage = () => {
    React.useEffect(() => {
        AccessibilityInfo.announceForAccessibility('Camera and media permissions are required.');
    }, []);
    return (
        <ThemedView style={styles.container} accessible={true} accessibilityLabel="Permissions required">
            <ThemedText style={styles.text}>
                Camera and media permissions are required.
            </ThemedText>
        </ThemedView>
    );
};

// Accessible camera error component
const NoCameraDeviceError = () => {
    React.useEffect(() => {
        AccessibilityInfo.announceForAccessibility('No camera device found.');
    }, []);
    return (
        <ThemedView style={styles.container} accessible={true} accessibilityLabel="No camera device found">
            <ThemedText style={styles.text}>
                No camera device found.
            </ThemedText>
        </ThemedView>
    );
};

export default function Index() {
    const device = useCameraDevice('back');
    const { hasPermission, requestPermission } = useCameraPermission();
    const [mediaLibraryPermission, requestMediaLibraryPermission] = ExpoMediaLibrary.usePermissions();
    // Type navigation as DrawerNavigationProp for toggleDrawer
    const navigation = useNavigation<DrawerNavigationProp<any>>();

    React.useEffect(() => {
        if (!hasPermission) requestPermission();
        if (!mediaLibraryPermission?.granted) requestMediaLibraryPermission();
    }, [hasPermission, mediaLibraryPermission, requestPermission, requestMediaLibraryPermission]);

    if (!hasPermission || !mediaLibraryPermission?.granted) {
        return <PermissionsPage />;
    }
    if (device == null) return <NoCameraDeviceError />;

    return (
        <SafeAreaView style={styles.container} accessible={true} accessibilityLabel="Camera view screen">
            {/* Drawer Toggle Button */}
            <TouchableOpacity
                style={styles.drawerToggle}
                onPress={() => navigation.toggleDrawer()}
                accessible={true}
                accessibilityLabel="Open navigation drawer"
            >
                <Ionicons name="menu" size={32} color={Colors.dark.text} />
            </TouchableOpacity>
            <View
                style={{ flex: 2, borderRadius: 10, overflow: 'hidden' }}
                accessible={true}
                accessibilityLabel="Live camera preview"
                importantForAccessibility="yes"
            >
                <Camera
                    style={{ flex: 1 }}
                    device={device}
                    isActive={true}
                />
            </View>
            {/* Placeholder for future controls (accessible buttons, status, etc.) */}
            <View
                style={{ flex: 1 }}
                accessible={true}
                accessibilityLabel="Controls area"
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: Platform.OS === "android" ? 60 : 0,
        backgroundColor: Colors.dark.background, // Use theme color
    },
    drawerToggle: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 40 : 10,
        right: 10, // moved from left to right
        zIndex: 10,
        backgroundColor: 'transparent',
        padding: 8,
        borderRadius: 20,
    },
    text: {
        fontSize: 24,
        fontFamily: 'AtkinsonBold',
        color: Colors.dark.text, // Use theme color
    },
    textHighlight: {
        fontSize: 30,
        color: Colors.dark.secondaryAccent,
    },
});