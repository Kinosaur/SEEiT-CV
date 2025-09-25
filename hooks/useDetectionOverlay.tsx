import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type DetLabel = { name: string; c: number }
type DetObj = {
  id: number
  b: [number, number, number, number]
  labels?: DetLabel[]
  distance_m?: number | null
  distance_src?: string
  distance_cat?: string
  distance_cat_conf?: string
}

export interface DetectionOverlayProps {
  containerWidth: number
  containerHeight: number
  frameWidth: number
  frameHeight: number
  objects: DetObj[]
  strokeColor?: string
  strokeWidth?: number
  showLabel?: boolean
}

interface BoxStyle { left: number; top: number; width: number; height: number }

function mapBoxCover(
  b: [number, number, number, number],
  frameW: number,
  frameH: number,
  viewW: number,
  viewH: number
): BoxStyle | null {
  if (frameW <= 0 || frameH <= 0 || viewW <= 0 || viewH <= 0) return null
  const scale = Math.max(viewW / frameW, viewH / frameH)
  const dispW = frameW * scale
  const dispH = frameH * scale
  const offsetX = (viewW - dispW) / 2
  const offsetY = (viewH - dispH) / 2
  const [x, y, w, h] = b
  const xC = Math.min(Math.max(x, 0), 1)
  const yC = Math.min(Math.max(y, 0), 1)
  const wC = Math.min(Math.max(w, 0), 1 - xC)
  const hC = Math.min(Math.max(h, 0), 1 - yC)
  return {
    left: offsetX + xC * dispW,
    top: offsetY + yC * dispH,
    width: wC * dispW,
    height: hC * dispH
  }
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  containerWidth,
  containerHeight,
  frameWidth,
  frameHeight,
  objects,
  strokeColor = '#00FF77',
  strokeWidth = 3,
  showLabel = true,
}) => {
  const boxes = useMemo(() => {
    if (!objects || objects.length === 0) return []
    return objects.map(o => {
      const m = mapBoxCover(o.b, frameWidth, frameHeight, containerWidth, containerHeight)
      if (!m) return null
      const lbl = o.labels && o.labels.length > 0 ? o.labels[0] : undefined
      const dist = o.distance_m
      const distText = dist == null ? '—' : (dist < 10 ? dist.toFixed(1) : Math.round(dist).toString())
      const cat = o.distance_cat && o.distance_cat !== 'unknown' ? o.distance_cat : null
      const catSuffix = cat ? ` (${cat})` : ''
      let text = lbl ? `${lbl.name}${catSuffix} — ${distText} m` : `—${catSuffix} — ${distText} m`
      return { id: o.id, style: m, text }
    }).filter(Boolean) as { id: number; style: BoxStyle; text: string }[]
  }, [objects, frameWidth, frameHeight, containerWidth, containerHeight])

  if (containerWidth === 0 || containerHeight === 0) return null

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {boxes.map(bx => (
        <View
          key={bx.id}
          style={[
            styles.box,
            {
              left: bx.style.left,
              top: bx.style.top,
              width: bx.style.width,
              height: bx.style.height,
              borderColor: strokeColor,
              borderWidth: strokeWidth
            }
          ]}
        >
          {showLabel && (
            <View style={styles.labelContainer}>
              <Text style={styles.labelText}>{bx.text}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderRadius: 4,
    borderStyle: 'solid',
  },
  labelContainer: {
    position: 'absolute',
    top: -22,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  labelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  }
})

export default DetectionOverlay