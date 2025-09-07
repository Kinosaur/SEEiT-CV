import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

type NormalizedBox = {
    x: number
    y: number
    width: number
    height: number
}

export type DetectionObject = {
    id?: string | number
    label?: string
    score?: number
    color?: string
    norm?: Partial<NormalizedBox>
    // Allow arbitrary extra properties from native plugins
    [key: string]: any
}

type Props = {
    objects: DetectionObject[]
    previewWidth: number
    previewHeight: number
}

function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val))
}

export const OverlayDetection = React.memo(function OverlayDetection({ objects, previewWidth, previewHeight }: Props) {
    if (!previewWidth || !previewHeight) return null

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {objects.map((obj, i) => {
                const norm = obj.norm || {}

                // Clamp each value to [0, 1]
                const raw = {
                    x: typeof norm.x === "number" ? norm.x : 0,
                    y: typeof norm.y === "number" ? norm.y : 0,
                    width: typeof norm.width === "number" ? norm.width : 0,
                    height: typeof norm.height === "number" ? norm.height : 0,
                }
                const clamped = {
                    x: clamp(raw.x, 0, 1),
                    y: clamp(raw.y, 0, 1),
                    width: clamp(raw.width, 0, 1),
                    height: clamp(raw.height, 0, 1),
                }

                // If box was clamped, flag it (e.g. red border)
                const wasClamped = (
                    raw.x !== clamped.x ||
                    raw.y !== clamped.y ||
                    raw.width !== clamped.width ||
                    raw.height !== clamped.height
                )

                const left = previewWidth * clamped.x
                const top = previewHeight * clamped.y
                const width = previewWidth * clamped.width
                const height = previewHeight * clamped.height

                if (width <= 0 || height <= 0) return null
                const color = wasClamped ? 'red' : (obj.color || 'lime')
                const label = obj.label || obj.id?.toString() || '?'
                const score = typeof obj.score === "number" ? ` (${(obj.score * 100).toFixed(0)}%)` : ""
                return (
                    <View
                        key={obj.id ?? i}
                        style={{
                            position: 'absolute',
                            left,
                            top,
                            width,
                            height,
                            borderWidth: 2,
                            borderColor: color,
                            borderRadius: 2,
                        }}
                    >
                        <Text
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                color,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                fontSize: 10,
                                paddingHorizontal: 2,
                            }}
                        >
                            {label}{score}
                            {wasClamped ? ' ⚠' : ''}
                        </Text>
                    </View>
                )
            })}
        </View>
    )
}, (prev, next) => prev.objects === next.objects && prev.previewWidth === next.previewWidth && prev.previewHeight === next.previewHeight)