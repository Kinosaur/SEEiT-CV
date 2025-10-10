import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import {
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Feedback() {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const navigation = useNavigation();

    const [title, setTitle] = React.useState('');
    const [desc, setDesc] = React.useState('');
    const [imgUri, setImgUri] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const valid = title.trim().length >= 4 && desc.trim().length >= 10;

    const pickImage = React.useCallback(async () => {
        try {
            setBusy(true);
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission required', 'Media library permission is needed to attach an image.');
                return;
            }
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsMultipleSelection: false,
                quality: 0.8,
                exif: false,
                ...(Platform.OS === 'android' ? { legacy: false } as const : {}),
            });
            if (!res.canceled && res.assets?.length) {
                setImgUri(res.assets[0].uri);
            }
        } catch (e) {
            // Best-effort; no crash
        } finally {
            setBusy(false);
        }
    }, []);

    const removeImage = React.useCallback(() => setImgUri(null), []);

    const onSend = React.useCallback(() => {
        Alert.alert('Feedback', 'Sending is disabled in this build. Your input is noted.');
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} accessible accessibilityLabel="Feedback screen">
            {/* Drawer menu toggle (top-left) */}
            <TouchableOpacity
                style={styles.drawerToggle}
                onPress={() => (navigation as any).toggleDrawer?.()}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Open navigation drawer"
            >
                <Ionicons name="menu" size={32} color={theme.text} />
            </TouchableOpacity>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <ThemedText style={[styles.title, { color: theme.text }]}>Feedback</ThemedText>
                <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
                    Tell us what is working, what is not, or what you need.
                </ThemedText>

                <View accessible accessibilityLabel="Title field">
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Title</ThemedText>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="Brief summary"
                        placeholderTextColor={theme.placeholder}
                        style={[styles.input, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.surface }]}
                        accessibilityLabel="Feedback title"
                    />
                </View>

                <View accessible accessibilityLabel="Description field">
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Description</ThemedText>
                    <TextInput
                        value={desc}
                        onChangeText={setDesc}
                        placeholder="Describe the issue or idea"
                        placeholderTextColor={theme.placeholder}
                        style={[styles.textarea, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.surface }]}
                        multiline
                        textAlignVertical="top"
                        numberOfLines={6}
                        accessibilityLabel="Feedback description"
                    />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Buttons
                        onPress={pickImage}
                        accessibilityLabel="Attach image"
                        iconName="image-outline"
                        iconPosition="left"
                        title={imgUri ? 'Change image' : 'Attach image'}
                        disabled={busy}
                    />
                    {imgUri ? (
                        <TouchableOpacity onPress={removeImage} accessibilityLabel="Remove attached image" accessibilityRole="button">
                            <ThemedText style={{ color: theme.error, fontWeight: '600' }}>Remove</ThemedText>
                        </TouchableOpacity>
                    ) : null}
                </View>

                {imgUri ? (
                    <View style={[styles.thumbWrap, { borderColor: theme.divider }]}>
                        <Image source={{ uri: imgUri }} style={{ width: 120, height: 90, borderRadius: 6 }} />
                    </View>
                ) : null}

                <View style={{ height: 8 }} />

                <Buttons
                    title={busy ? 'Please wait…' : 'Send'}
                    onPress={onSend}
                    variant="primary"
                    size="lg"
                    disabled={!valid || busy}
                    accessibilityLabel="Send feedback"
                    accessibilityState={{ disabled: !valid || busy, busy: busy || undefined }}
                    containerStyle={{ alignSelf: 'stretch', justifyContent: 'center' }}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    drawerToggle: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 40 : 10,
        right: 10,
        zIndex: 10,
        padding: 8,
        borderRadius: 20,
    },
    title: { fontFamily: 'AtkinsonBold', fontSize: 22 },
    subtitle: { fontFamily: 'Atkinson', fontSize: 14 },
    label: { fontFamily: 'AtkinsonBold', fontSize: 14, marginBottom: 4 },
    input: {
        borderWidth: 2,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: 'Atkinson',
        fontSize: 16,
    },
    textarea: {
        borderWidth: 2,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 120,
        fontFamily: 'Atkinson',
        fontSize: 16,
    },
    thumbWrap: {
        marginTop: 6,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 6,
        alignSelf: 'flex-start',
        borderRadius: 8,
    },
});