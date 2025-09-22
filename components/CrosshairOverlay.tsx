import React from 'react';
import { StyleSheet, View } from 'react-native';

export type Crosshair = { x: number; y: number } // normalized 0..1 (image space)

export function CrosshairOverlay({
    A, B, imageRect,
}: {
    A?: Crosshair
    B?: Crosshair
    imageRect: { left: number; top: number; width: number; height: number }
}) {
    const dot = (pt?: Crosshair, color = '#00e5ff') => {
        if (!pt) return null
        const cx = imageRect.left + pt.x * imageRect.width
        const cy = imageRect.top + pt.y * imageRect.height
        return (
            <View key={`${color}-${cx}-${cy}`} style={[styles.cross, { left: cx - 10, top: cy - 10, borderColor: color }]} />
        )
    }
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {dot(A, '#00e5ff')}
            {dot(B, '#ff4081')}
        </View>
    )
}

const styles = StyleSheet.create({
    cross: {
        position: 'absolute',
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 3,
        backgroundColor: 'transparent',
    },
})