import React from 'react'
import { AccessibilityInfo } from 'react-native'

export type NormalizedBox = {
    x: number
    y: number
    width: number
    height: number
}

export type DetectionObject = {
    id?: number | string
    label?: string
    score?: number // 0..1
    norm?: Partial<NormalizedBox>
    [key: string]: any
}

type SpeakFn = (text: string) => Promise<any> | any

export type NotifierOptions = {
    enabled: boolean
    useTTS: boolean
    stableFrames?: number
    minConfidence?: number
    perObjectCooldownMs?: number
    globalCooldownMs?: number
    includeConfidenceInMessage?: boolean
    summarizeMultiple?: boolean
    speakTTS: SpeakFn
    announceA11y?: (msg: string) => void
    labelMap?: Record<string, string | null>
    allowUnlabeled?: boolean
    numbering?: boolean
    numberFormat?: 'words' | 'number'
    numberingResetMs?: number
    // New hysteresis & clustering controls
    labelHoldMs?: number               // ms to keep last spoken label dominant
    minScoreDeltaToSwitch?: number     // required score margin to switch within hold window
    iouThresholdForCluster?: number    // IoU threshold for merging overlapping detections
}

const defaults = {
    stableFrames: 3,
    minConfidence: 0.5,
    perObjectCooldownMs: 5000,
    globalCooldownMs: 1200,
    includeConfidenceInMessage: false,
    summarizeMultiple: false,
    allowUnlabeled: false,
    numbering: true,
    numberFormat: 'words' as const,
    numberingResetMs: 6000,
    labelHoldMs: 2000,
    minScoreDeltaToSwitch: 0.12,
    iouThresholdForCluster: 0.5,
}

// Default mapping
const DEFAULT_LABEL_MAP: Record<string, string | null> = {
    'home good': 'household item',
    'fashion good': 'clothing item',
}

function getIdKey(id?: number | string) {
    if (id === undefined || id === null) return ''
    if (id === -1 || id === '-1') return '' // ignore unstable ids
    return String(id)
}

function normalizeAndMapLabel(
    raw: string | undefined,
    map: Record<string, string | null>,
    allowUnlabeled: boolean
): string | null {
    if (!raw || !raw.trim()) {
        return allowUnlabeled ? 'object' : null
    }
    const key = raw.trim().toLowerCase()
    if (Object.prototype.hasOwnProperty.call(map, key)) {
        return map[key]
    }
    return raw.trim()
}

function numberToWords(n: number): string {
    const words: Record<number, string> = {
        1: 'one',
        2: 'two',
        3: 'three',
        4: 'four',
        5: 'five',
        6: 'six',
        7: 'seven',
        8: 'eight',
        9: 'nine',
        10: 'ten',
    }
    return words[n] ?? String(n)
}

// IoU utilities
function boxFromNorm(d: DetectionObject): { x: number; y: number; w: number; h: number } | null {
    const n = d.norm
    if (!n) return null
    const { x, y, width, height } = n
    if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof width !== 'number' ||
        typeof height !== 'number'
    ) return null
    if (width <= 0 || height <= 0) return null
    return { x, y, w: width, h: height }
}

function iou(a: DetectionObject, b: DetectionObject): number {
    const A = boxFromNorm(a)
    const B = boxFromNorm(b)
    if (!A || !B) return 0
    const x1 = Math.max(A.x, B.x)
    const y1 = Math.max(A.y, B.y)
    const x2 = Math.min(A.x + A.w, B.x + B.w)
    const y2 = Math.min(A.y + A.h, B.y + B.h)
    const interW = x2 - x1
    const interH = y2 - y1
    if (interW <= 0 || interH <= 0) return 0
    const interArea = interW * interH
    const areaA = A.w * A.h
    const areaB = B.w * B.h
    return interArea / (areaA + areaB - interArea)
}

// Cluster by IoU and keep best-scoring representative
function clusterDetections(dets: DetectionObject[], threshold: number): DetectionObject[] {
    if (dets.length <= 1) return dets
    const clusters: DetectionObject[][] = []
    for (const d of dets) {
        let placed = false
        for (const c of clusters) {
            // Compare with cluster representative (first element)
            if (iou(d, c[0]) >= threshold) {
                c.push(d)
                placed = true
                break
            }
        }
        if (!placed) clusters.push([d])
    }
    // Pick best (highest score) per cluster
    return clusters.map(c => {
        c.sort((a, b) => ((b.score ?? -1) - (a.score ?? -1)))
        return c[0]
    })
}

/**
 * Notifier with:
 *  - Label mapping & unlabeled suppression
 *  - Stability, cooldowns
 *  - Numbering with reset after inactivity
 *  - Hysteresis (label hold + score delta)
 *  - Spatial clustering to reduce overlapping duplicates
 */
export function useDetectionsNotifier(opts: NotifierOptions) {
    const optionsRef = React.useRef<NotifierOptions>({
        ...defaults,
        ...opts,
    })

    optionsRef.current = {
        ...defaults,
        ...opts,
    }

    const stableCountsRef = React.useRef<Map<string, number>>(new Map())
    const lastAnnouncedAtRef = React.useRef<Map<string, number>>(new Map())
    const lastGlobalSpokenAtRef = React.useRef<number>(0)

    // Numbering state
    const idToNumberRef = React.useRef<Map<string, number>>(new Map())
    const idToLabelRef = React.useRef<Map<string, string>>(new Map())
    const labelNextNumberRef = React.useRef<Map<string, number>>(new Map())
    const labelLastSeenRef = React.useRef<Map<string, number>>(new Map())

    // Hysteresis state
    const lastSpokenLabelRef = React.useRef<string | null>(null)
    const lastSpokenLabelTsRef = React.useRef<number>(0)
    const numberingResetLoggedRef = React.useRef<Set<string>>(new Set()) // debug logging guard

    const speakA11y = React.useCallback((msg: string) => {
        if (optionsRef.current.announceA11y) {
            optionsRef.current.announceA11y(msg)
        } else {
            AccessibilityInfo.announceForAccessibility(msg)
        }
    }, [])

    const maybeResetNumberingForLabel = React.useCallback((label: string, now: number) => {
        const { numberingResetMs } = optionsRef.current
        if (!numberingResetMs) return
        const lastSeen = labelLastSeenRef.current.get(label)
        if (lastSeen == null) return
        if (now - lastSeen >= numberingResetMs) {
            labelNextNumberRef.current.set(label, 1)
            // Purge any id mappings for that label
            for (const [id, lbl] of Array.from(idToLabelRef.current.entries())) {
                if (lbl === label) {
                    idToLabelRef.current.delete(id)
                    idToNumberRef.current.delete(id)
                }
            }
            if (__DEV__ && !numberingResetLoggedRef.current.has(label)) {
                numberingResetLoggedRef.current.add(label)
                console.log('[Notifier] numbering reset for label:', label)
            }
        }
    }, [])

    return React.useCallback((detections: DetectionObject[]) => {
        const {
            enabled,
            useTTS,
            stableFrames,
            minConfidence,
            perObjectCooldownMs,
            globalCooldownMs,
            includeConfidenceInMessage,
            summarizeMultiple,
            speakTTS,
            labelMap,
            allowUnlabeled,
            numbering,
            numberFormat,
            numberingResetMs,
            labelHoldMs,
            minScoreDeltaToSwitch,
            iouThresholdForCluster,
        } = optionsRef.current

        if (!enabled) return

        const now = Date.now()
        const presentIds = new Set<string>()
        const mergedMap = { ...DEFAULT_LABEL_MAP, ...(labelMap || {}) }

        // Preprocess & filter
        const processed: DetectionObject[] = []
        const labelsPresentThisFrame = new Set<string>()
        for (const d of detections) {
            const mappedLabel = normalizeAndMapLabel(d.label as any, mergedMap, allowUnlabeled ?? defaults.allowUnlabeled)
            if (mappedLabel === null) continue
            processed.push({ ...d, label: mappedLabel })
            labelsPresentThisFrame.add(mappedLabel)
        }

        // Stability counts
        for (const d of processed) {
            const key = getIdKey(d.id as any)
            if (!key) continue
            presentIds.add(key)
            stableCountsRef.current.set(key, (stableCountsRef.current.get(key) ?? 0) + 1)
        }
        // Remove stale IDs
        for (const key of Array.from(stableCountsRef.current.keys())) {
            if (!presentIds.has(key)) stableCountsRef.current.delete(key)
        }

        // Early bookkeeping of label last-seen (even if not yet candidates)
        for (const lbl of labelsPresentThisFrame) {
            labelLastSeenRef.current.set(lbl, now)
        }

        // Numbering resets (per label)
        if (numbering && numberingResetMs) {
            for (const [label] of labelLastSeenRef.current.entries()) {
                maybeResetNumberingForLabel(label, now)
            }
        }

        // Build candidate list
        let candidates: DetectionObject[] = []
        for (const d of processed) {
            const key = getIdKey(d.id as any)
            if (!key) continue

            if ((stableCountsRef.current.get(key) ?? 0) < (stableFrames ?? defaults.stableFrames)) continue

            const lastAt = lastAnnouncedAtRef.current.get(key) ?? 0
            if (now - lastAt < (perObjectCooldownMs ?? defaults.perObjectCooldownMs)) continue

            const sc = typeof d.score === 'number' ? d.score : 0
            if (sc < (minConfidence ?? defaults.minConfidence)) continue

            candidates.push(d)
        }

        if (candidates.length === 0) return

        // Spatial clustering to reduce overlaps
        candidates = clusterDetections(candidates, iouThresholdForCluster ?? defaults.iouThresholdForCluster)

        // Global cooldown
        if (now - lastGlobalSpokenAtRef.current < (globalCooldownMs ?? defaults.globalCooldownMs)) return

        let message = ''
        let chosenKey = ''
        let chosenLabel = ''

        if (summarizeMultiple && candidates.length > 1) {
            // Summaries bypass hysteresis for simplicity
            const counts = new Map<string, number>()
            for (const c of candidates) {
                const name = c.label!
                counts.set(name, (counts.get(name) ?? 0) + 1)
            }
            const parts: string[] = []
            for (const [name, cnt] of counts) parts.push(`${cnt} ${name}${cnt > 1 ? 's' : ''}`)
            message = `Detected ${parts.join(', ')}.`
        } else {
            // Sort by score
            candidates.sort((a, b) => ((b.score ?? -1) - (a.score ?? -1)))
            const best = candidates[0]
            const key = getIdKey(best.id as any)
            const label = best.label!
            const bestScore = best.score ?? 0
            let spokenLabel = label

            // Hysteresis: if last label still present, decide if we switch
            const lastLabel = lastSpokenLabelRef.current
            const lastLabelTs = lastSpokenLabelTsRef.current
            let allowSwitch = true
            if (lastLabel && lastLabel !== label && (now - lastLabelTs) < (labelHoldMs ?? defaults.labelHoldMs)) {
                // Is last label still in frame (any candidate or processed detection with that label)?
                const stillHasLast = processed.some(d => d.label === lastLabel)
                if (stillHasLast) {
                    // Find score of last label’s top candidate
                    const lastBestScore = candidates
                        .filter(c => c.label === lastLabel)
                        .map(c => c.score ?? 0)
                        .sort((a, b) => b - a)[0] ?? 0
                    const deltaNeeded = minScoreDeltaToSwitch ?? defaults.minScoreDeltaToSwitch
                    if (bestScore < lastBestScore + deltaNeeded) {
                        allowSwitch = false
                    }
                }
            }

            if (!allowSwitch && lastLabel) {
                // Stick with last label; abort announcing new label (treat as cooldown)
                return
            }

            chosenKey = key
            chosenLabel = label

            // Numbering
            if (numbering && key) {
                if (!idToNumberRef.current.has(key)) {
                    const nextNum = labelNextNumberRef.current.get(label) ?? 1
                    idToNumberRef.current.set(key, nextNum)
                    idToLabelRef.current.set(key, label)
                    labelNextNumberRef.current.set(label, nextNum + 1)
                }
                const n = idToNumberRef.current.get(key)!
                const suffix = numberFormat === 'number' ? String(n) : numberToWords(n)
                spokenLabel = `${label} ${suffix}`
            }

            const conf = typeof best.score === 'number' ? ` ${(best.score * 100).toFixed(0)}%` : ''
            message = includeConfidenceInMessage
                ? `Detected ${spokenLabel}${conf ? `, ${conf}` : ''}.`
                : `Detected ${spokenLabel}.`
        }

        lastGlobalSpokenAtRef.current = now
        if (useTTS) {
            Promise.resolve(speakTTS(message)).catch(() => { })
        } else {
            speakA11y(message)
        }

        if (chosenKey) {
            lastAnnouncedAtRef.current.set(chosenKey, now)
            lastSpokenLabelRef.current = chosenLabel
            lastSpokenLabelTsRef.current = now
        }

        if (__DEV__) {
            console.log('[Notifier] spoke:', {
                message,
                candidates: candidates.slice(0, 3).map(c => ({
                    id: c.id, label: c.label, score: c.score
                })),
                hysteresis: {
                    lastSpokenLabel: lastSpokenLabelRef.current,
                    holdMs: labelHoldMs,
                    minScoreDeltaToSwitch,
                }
            })
        }
    }, [speakA11y, maybeResetNumberingForLabel])
}