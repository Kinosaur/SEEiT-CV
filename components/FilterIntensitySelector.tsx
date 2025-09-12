import { ThemedText } from '@/components/ThemedText';
import React from 'react';
import { AccessibilityInfo, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
    value: number;          // 1..5
    onChange: (v: number) => void;
    disabled?: boolean;
    theme: {
        text: string;
        divider: string;
        accent: string;
        secondaryAccent?: string;
        surface: string;
        textSecondary: string;
    };
}

const MIN = 1;
const MAX = 5;

export function FilterIntensitySelector({ value, onChange, disabled, theme }: Props) {
    const accent = theme.secondaryAccent ?? theme.accent;

    const handlePress = (v: number) => {
        if (disabled) return;
        if (v === value) return;
        onChange(v);
        AccessibilityInfo.announceForAccessibility?.(
            v === 1
                ? 'Filter intensity 1 of 5, neutral selected'
                : v === 5
                    ? 'Filter intensity 5 of 5, maximum selected'
                    : `Filter intensity ${v} of 5 selected`
        );
    };

    const segments = [];
    for (let i = MIN; i <= MAX; i++) {
        const selected = i === value;
        segments.push(
            <TouchableOpacity
                key={i}
                style={[
                    styles.segment,
                    {
                        borderColor: selected ? accent : theme.divider,
                        backgroundColor: selected ? accent : theme.surface,
                    },
                    disabled && { opacity: 0.4 },
                ]}
                accessible
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !!disabled }}
                accessibilityLabel={
                    i === 1
                        ? 'Intensity 1 neutral'
                        : i === 5
                            ? 'Intensity 5 maximum'
                            : `Intensity ${i}`
                }
                accessibilityHint="Adjust color filter intensity"
                onPress={() => handlePress(i)}
            >
                <ThemedText
                    style={[
                        styles.segmentLabel,
                        { color: selected ? '#000' : theme.text },
                    ]}
                >
                    {i}
                </ThemedText>
            </TouchableOpacity>
        );
    }

    return (
        <View
            style={styles.wrapper}
            accessible
            accessibilityRole="radiogroup"
            accessibilityLabel="Filter intensity"
            accessibilityState={{ disabled: !!disabled }}
        >
            {segments}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 2,
    },
    segment: {
        minWidth: 36,
        height: 34,
        borderRadius: 8,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    segmentLabel: {
        fontFamily: 'AtkinsonBold',
        fontSize: 14,
    },
});