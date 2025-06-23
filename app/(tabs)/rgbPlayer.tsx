import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useIsFocused } from '@react-navigation/native';
import * as React from 'react';
import { AppState, Dimensions, StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';

export default function RgbPlayer() {
    const device = useCameraDevice('back');
    const { hasPermission, requestPermission } = useCameraPermission();
    const isFocused = useIsFocused();
    const [appState, setAppState] = React.useState(AppState.currentState);

    React.useEffect(() => {
        const subscription = AppState.addEventListener('change', setAppState);
        return () => subscription.remove();
    }, []);

    // Use useCameraFormat to select a 3:4 aspect ratio format
    const format = useCameraFormat(device, [
        { videoAspectRatio: 4 / 3 }
    ]);

    const isActive = isFocused && appState === 'active';

    React.useEffect(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);

    if (!hasPermission) {
        return (
            <ThemedView style={styles.container} accessibilityRole='header'>
                <ThemedText style={styles.text}>Camera permission required.</ThemedText>
            </ThemedView>
        );
    }
    if (device == null) {
        return (
            <ThemedView style={styles.container} accessibilityRole='header'>
                <ThemedText style={styles.text}>No camera device found.</ThemedText>
            </ThemedView>
        );
    }
    if (!format) {
        return (
            <ThemedView style={styles.container} accessibilityRole='header'>
                <ThemedText style={styles.text}>No 3:4 format found.</ThemedText>
            </ThemedView>
        );
    }

    // Calculate preview size for 3:4 ratio
    const { width: screenWidth } = Dimensions.get('window');
    const previewWidth = screenWidth;
    const previewHeight = (screenWidth * 4) / 3;

    return (
        <ThemedView style={styles.container} accessibilityRole='header'>
            <ThemedView style={styles.cameraWrapper}>
                <Camera
                    style={{ width: previewWidth, height: previewHeight, borderRadius: 12 }}
                    device={device}
                    isActive={isActive}
                    format={format}
                    photo={true}
                    video={true}
                />
            </ThemedView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    cameraWrapper: {
        marginTop: -80, // Move the camera feed up. Adjust as needed.
        // You can also use marginBottom, marginLeft, marginRight, alignSelf, etc.
    },
    text: {
        fontSize: 24,
        fontFamily: 'AtkinsonBold',
    },
});
