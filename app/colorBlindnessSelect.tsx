import Buttons from '@/components/Buttons';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FeatureItem = {
    key: string;
    name: string;
    description: string;
};

const FEATURES: FeatureItem[] = [
    {
        key: 'color_finder',
        name: 'Color Finder',
        description: 'Detect true colors for confusable colors.',
    },
];

interface ItemProps {
    keyVal: string;
    name: string;
    description: string;
    selected: boolean;
    onPress: () => void;
    themeText: string;
    themeTextSecondary: string;
    themeAccent: string;
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

export default function FeatureSelectScreen() {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const navigation = useNavigation();
    const [pending, setPending] = useState(FEATURES[0]?.key ?? '');
    const [saving, setSaving] = useState(false);
    const [loading] = useState(false); // no setter to avoid unused var warning

    const onConfirm = async () => {
        if (!pending) return;
        setSaving(true);
        try {
            // @ts-ignore
            navigation.navigate('colorBlindCameraScreen');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator color={theme.accent} size="large" />
                <ThemedText style={{ marginTop: 12 }}>Loading features…</ThemedText>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: theme.background }]}
            accessible
            accessibilityLabel="Feature selection screen"
            accessibilityHint="Select your feature and continue"
        >
            <View style={styles.headerBlock}>
                <ThemedText style={[styles.title, { color: theme.text }]}>
                    Select your feature
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                    These features are currently available. You can change anytime.
                </ThemedText>
            </View>

            <View
                accessible
                accessibilityRole="radiogroup"
                accessibilityLabel="Features list"
                style={{ flex: 1 }}
            >
                <FlatList
                    data={FEATURES}
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
                            isLast={index === FEATURES.length - 1}
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
                    variant="primary"
                    size="lg"
                    loading={saving}
                />
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
        fontSize: 22,
    },
    subtitle: {
        fontFamily: 'Atkinson',
        fontSize: 16,
        marginTop: 6,
        color: '#555',
    },
    row: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 14,
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
        fontSize: 18,
    },
    optionDesc: {
        fontFamily: 'Atkinson',
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 24,
    },
});