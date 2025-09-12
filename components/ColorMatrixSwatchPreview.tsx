import { ThemedText } from '@/components/ThemedText';
import { useColorCorrectionMatrix } from '@/hooks/useColorCorrectionMatrix';
import { applyColorMatrix4x5, hexToRgb, rgbToHex } from '@/utils/colorMatrixApply';
import React from 'react';
import { StyleSheet, View } from 'react-native';

type Swatch = { name: string; hex: string };

const SWATCHES: Swatch[] = [
    { name: 'Red', hex: '#FF3B30' },
    { name: 'Green', hex: '#34C759' },
    { name: 'Blue', hex: '#007AFF' },
    { name: 'Yellow', hex: '#FFCC00' },
    { name: 'Magenta', hex: '#FF2D55' },
    { name: 'Cyan', hex: '#32ADE6' },
];

export function ColorMatrixSwatchPreview() {
    const mtx = useColorCorrectionMatrix();

    return (
        <View style={styles.container} accessible accessibilityLabel="Filter intensity preview swatches">
            <ThemedText style={styles.title}>Preview</ThemedText>
            <View style={styles.rows}>
                {SWATCHES.map((s) => {
                    const rgb = hexToRgb(s.hex);
                    const out = applyColorMatrix4x5(rgb, mtx);
                    const outHex = rgbToHex(out);
                    return (
                        <View key={s.name} style={styles.row} accessible accessibilityLabel={`${s.name} swatch original and corrected`}>
                            <View style={styles.labelBlock}>
                                <ThemedText style={styles.label}>{s.name}</ThemedText>
                            </View>
                            <View style={[styles.swatch, { backgroundColor: s.hex }]} accessible accessibilityLabel={`${s.name} original`} />
                            <View style={[styles.swatch, { backgroundColor: outHex }]} accessible accessibilityLabel={`${s.name} corrected`} />
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 12,
        marginTop: 6,
        marginBottom: 10,
    },
    title: {
        fontFamily: 'AtkinsonBold',
        fontSize: 14,
        marginBottom: 4,
    },
    rows: {
        borderRadius: 10,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    labelBlock: {
        width: 80,
        paddingLeft: 2,
    },
    label: {
        fontFamily: 'Atkinson',
        fontSize: 12,
    },
    swatch: {
        flex: 1,
        height: 22,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },
});