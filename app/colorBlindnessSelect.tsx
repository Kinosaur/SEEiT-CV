import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { COLOR_BLINDNESS_MAP, COLOR_BLINDNESS_TYPES } from '@/constants/colorBlindness';
import { Colors } from '@/constants/Colors';
import { useColorBlindness } from '@/context/ColorBlindnessContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ItemProps {
    keyVal: string;
    name: string;
    description: string;
    selected: boolean;
    onPress: () => void;
    themeText: string;
    themeTextSecondary: string;
    themeAccent: string; // secondary accent used intentionally for selection emphasis
    themeSurface: string;
    themeDivider: string;
    isFirst: boolean;
    isLast: boolean;
}

function RadioRow({
    keyVal, name, description, selected, onPress,
    themeText, themeTextSecondary, themeAccent, themeSurface, themeDivider, isFirst, isLast,
}: ItemProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.row,
                // Use secondary accent when selected for clear strong highlight; divider otherwise.
                { backgroundColor: themeSurface, borderColor: selected ? themeAccent : themeDivider },
                isFirst && { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
                isLast && { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
            ]}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={name}
            accessibilityHint={description}
        >
            <View style={[
                styles.radioOuter,
                { borderColor: selected ? themeAccent : themeDivider }
            ]}>
                {selected && <View style={[styles.radioInner, { backgroundColor: themeAccent }]} />}
            </View>
            <View style={{ flex: 1 }}>
                <ThemedText style={[styles.optionTitle, { color: themeText }]}>{name}</ThemedText>
                <ThemedText style={[styles.optionDesc, { color: themeTextSecondary }]}>{description}</ThemedText>
            </View>
        </TouchableOpacity>
    );
}

export default function ColorBlindnessSelectScreen() {
    const { selectedType, setSelectedType, loading } = useColorBlindness();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const navigation = useNavigation();
    const [pending, setPending] = useState(selectedType || '');
    const [saving, setSaving] = useState(false);

    const onConfirm = async () => {
        if (!pending || !COLOR_BLINDNESS_MAP[pending]) return;
        setSaving(true);
        try {
            await setSelectedType(pending);
            // Navigate to camera screen; name must match Drawer.Screen "colorBlindCameraScreen"
            // @ts-ignore (navigation type broad)
            navigation.navigate('colorBlindCameraScreen');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator color={theme.accent} size="large" />
                <ThemedText style={{ marginTop: 12 }}>Loading preference…</ThemedText>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: theme.background }]}
            accessible
            accessibilityLabel="Color blindness selection screen"
            accessibilityHint="Select your color blindness type and continue"
        >
            <View style={styles.headerBlock}>
                <ThemedText style={[styles.title, { color: theme.text }]}>
                    Select your color blindness type
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                    This helps us adapt colors for visibility. You can change anytime.
                </ThemedText>
            </View>

            <View
                accessible
                accessibilityRole="radiogroup"
                accessibilityLabel="Color blindness types list"
                style={{ flex: 1 }}
            >
                <FlatList
                    data={COLOR_BLINDNESS_TYPES}
                    // Using keyExtractor based on index for consistent ordering (keys already unique)
                    keyExtractor={(item) => item.key}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    renderItem={({ item, index }) => (
                        <RadioRow
                            keyVal={item.key}
                            name={item.name}
                            description={item.description}
                            selected={pending === item.key}
                            onPress={() => setPending(item.key)}
                            themeText={theme.text}
                            themeTextSecondary={theme.textSecondary}
                            themeAccent={theme.secondaryAccent}
                            themeSurface={theme.surface}
                            themeDivider={theme.divider}
                            isFirst={index === 0}
                            isLast={index === COLOR_BLINDNESS_TYPES.length - 1}
                        />
                    )}
                />
            </View>

            <View style={styles.footer}>
                <Buttons
                    title={saving ? 'Saving…' : 'Continue'}
                    onPress={onConfirm}
                    disabled={!pending || saving}
                    accessibilityLabel="Confirm selection"
                    accessibilityState={{ disabled: !pending || saving, busy: saving || undefined }}
                    containerStyle={{ alignSelf: 'stretch', justifyContent: 'center' }}
                    variant="primary" // Primary to signal main call to action
                    size="lg"
                    loading={saving}
                />
                <TouchableOpacity
                    onPress={() => {
                        // "Not sure?" branch: currently just navigates forward with no change.
                        // Alternative: navigate to an info modal. For now just skip if already has a type.
                        if (!pending) {
                            // If user really wants to skip without choosing, you could:
                            // navigation.navigate('colorBlindCameraScreen');
                            // But that leaves no stored type; decide policy later.
                        }
                    }}
                    style={{ paddingVertical: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel="Not sure about your type"
                    accessibilityHint="Opens information (future)"
                >
                    <ThemedText style={{ textAlign: 'center', color: theme.accent, fontSize: 15 }}>
                        Not sure? Learn more (coming soon)
                    </ThemedText>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 40 : 0,
    },
    headerBlock: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        marginBottom: 16,
    },
    title: {
        fontFamily: 'AtkinsonBold',
        fontSize: 22, // Increased for better hierarchy & readability
    },
    subtitle: {
        fontFamily: 'Atkinson',
        fontSize: 16, // Slightly larger for accessibility
        marginTop: 6,
        // Color now applied dynamically via theme (kept here as fallback no hardcoded gray)
        color: '#555',
    },
    row: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 14, // Increased touch target height
        borderWidth: 2,
        marginBottom: 10,
        alignItems: 'center',
        gap: 16,
    },
    radioOuter: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    optionTitle: {
        fontFamily: 'AtkinsonBold',
        fontSize: 18, // Slight increase for clarity
    },
    optionDesc: {
        fontFamily: 'Atkinson',
        fontSize: 14, // Larger for readability
        color: '#666', // Overridden dynamically
        marginTop: 2,
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 24,
    },
});