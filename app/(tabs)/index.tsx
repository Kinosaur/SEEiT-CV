import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import * as ExpoMediaLibrary from 'expo-media-library';
// import { useRouter } from 'expo-router';
import * as React from 'react';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Camera } from 'react-native-vision-camera';

export default function Index() {
    // const router = useRouter();
    const [cameraPermissionStatus, setCameraPermissionStatus] = React.useState('not-determined');
    const [microphonePermissionStatus, setMicrophonePermissionStatus] = React.useState('not-determined');
    const [mediaLibraryPermission, requestMediaLibraryPermission] = ExpoMediaLibrary.usePermissions();
    const [isChecking, setIsChecking] = React.useState(true);

    useEffect(() => {
        (async () => {
            // Camera
            let camStatus = await Camera.getCameraPermissionStatus();
            if (camStatus !== 'granted') {
                camStatus = await Camera.requestCameraPermission();
            }
            setCameraPermissionStatus(camStatus);

            // Microphone
            let micStatus = await Camera.getMicrophonePermissionStatus();
            if (micStatus !== 'granted') {
                micStatus = await Camera.requestMicrophonePermission();
            }
            setMicrophonePermissionStatus(micStatus);

            // Media Library
            let mediaStatus = mediaLibraryPermission;
            if (!mediaStatus || !mediaStatus.granted) {
                const newStatus = await requestMediaLibraryPermission();
                // requestMediaLibraryPermission returns a promise that resolves to the new permission object
                mediaStatus = newStatus || mediaStatus;
            }
            setIsChecking(false);
        })();
        // Only run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (
        isChecking ||
        cameraPermissionStatus !== 'granted' ||
        microphonePermissionStatus !== 'granted' ||
        !mediaLibraryPermission?.granted
    ) {
        return <ThemedView style={styles.container}><ThemedText style={styles.text}>Requesting permissions...</ThemedText></ThemedView>;
    }

    return (
        <ThemedView style={styles.container} accessibilityRole='header'>
            <ThemedText style={styles.text}>Welcome to <ThemedText style={styles.textHighlight}>SEEiT!</ThemedText></ThemedText>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 24,
        fontFamily: 'AtkinsonBold',
    },
    textHighlight: {
        fontSize: 30,
        color: Colors.dark.secondaryAccent,
    },
});