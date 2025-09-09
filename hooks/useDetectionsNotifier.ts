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
    // New:
    labelMap?: Record<string, string | null>  // lowercase raw -> spoken phrase (null => suppress)
    allowUnlabeled?: boolean                  // default false (ignore unlabeled completely)
}

const defaults = {
    stableFrames: 3,
    minConfidence: 0.5,
    perObjectCooldownMs: 5000,
    globalCooldownMs: 1200,
    includeConfidenceInMessage: false,
    summarizeMultiple: false,
    allowUnlabeled: false,
}

// Default mapping: adjust/extend later
const DEFAULT_LABEL_MAP: Record<string, string | null> = {
    // Normalize awkward model output
    'home good': 'household item',
    'fashion good': 'clothing item',
    // Example future entries:
    // 'bottle': 'bottle',
    // 'cup': 'cup',
    // 'unknown': null, // suppress if model emits "unknown"
}

function getIdKey(id?: number | string) {
    if (id === undefined || id === null) return ''
    if (id === -1 || id === '-1') return '' // ignore unstable ids
    return String(id)
}

function normalizeAndMapLabel(raw: string | undefined, map: Record<string, string | null>, allowUnlabeled: boolean): string | null {
    if (!raw || !raw.trim()) {
        return allowUnlabeled ? 'object' : null
    }
    const key = raw.trim().toLowerCase()
    if (Object.prototype.hasOwnProperty.call(map, key)) {
        return map[key] // may be string or null
    }
    // If not in map, keep original (trimmed) label
    return raw.trim()
}

/**
 * Returns a callback notify(detections) to be called with latest detection array.
 * Now:
 *  - Ignores unlabeled detections if allowUnlabeled = false
 *  - Maps labels via labelMap + DEFAULT_LABEL_MAP
 *  - Suppresses any detection whose mapped label is null
 */
export function useDetectionsNotifier(opts: NotifierOptions) {
    const optionsRef = React.useRef<NotifierOptions>({
        ...defaults,
        ...opts,
    } as NotifierOptions)

    optionsRef.current = {
        ...defaults,
        ...opts,
    }

    const stableCountsRef = React.useRef<Map<string, number>>(new Map())
    const lastAnnouncedAtRef = React.useRef<Map<string, number>>(new Map())
    const lastGlobalSpokenAtRef = React.useRef<number>(0)

    const speakA11y = React.useCallback((msg: string) => {
        if (optionsRef.current.announceA11y) {
            optionsRef.current.announceA11y(msg)
        } else {
            AccessibilityInfo.announceForAccessibility(msg)
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
            allowUnlabeled = defaults.allowUnlabeled,
        } = optionsRef.current

        if (!enabled) return

        const now = Date.now()
        const presentIds = new Set<string>()

        // Merge default map with user map (user overrides default)
        const mergedMap = { ...DEFAULT_LABEL_MAP, ...(labelMap || {}) }

        // Preprocess detections: map labels & filter unlabeled if required
        const processed: DetectionObject[] = []
        for (const d of detections) {
            const mappedLabel = normalizeAndMapLabel(d.label as any, mergedMap, allowUnlabeled)
            if (mappedLabel === null) {
                continue // explicitly suppressed or unlabeled (when not allowed)
            }
            processed.push({ ...d, label: mappedLabel })
        }

        // Update stability counts only for processed detections
        for (const d of processed) {
            const key = getIdKey(d.id as any)
            if (!key) continue
            presentIds.add(key)
            const prev = stableCountsRef.current.get(key) ?? 0
            stableCountsRef.current.set(key, prev + 1)
        }
        // Purge IDs not present
        for (const key of Array.from(stableCountsRef.current.keys())) {
            if (!presentIds.has(key)) stableCountsRef.current.delete(key)
        }

        // Build candidates after stability & cooldown checks
        const candidates: DetectionObject[] = []
        for (const d of processed) {
            const key = getIdKey(d.id as any)
            if (!key) continue

            const count = stableCountsRef.current.get(key) ?? 0
            if (count < (stableFrames ?? defaults.stableFrames)) continue

            const lastAt = lastAnnouncedAtRef.current.get(key) ?? 0
            if (now - lastAt < (perObjectCooldownMs ?? defaults.perObjectCooldownMs)) continue

            // Confidence filter (all processed have labels by design)
            const sc = typeof d.score === 'number' ? d.score : 0
            if (sc < (minConfidence ?? defaults.minConfidence)) continue

            candidates.push(d)
        }

        if (candidates.length === 0) return

        if (now - lastGlobalSpokenAtRef.current < (globalCooldownMs ?? defaults.globalCooldownMs)) return

        let message = ''
        let chosenKey = ''

        if (summarizeMultiple && candidates.length > 1) {
            const counts = new Map<string, number>()
            for (const c of candidates) {
                const name = c.label!
                counts.set(name, (counts.get(name) ?? 0) + 1)
            }
            const parts: string[] = []
            for (const [name, cnt] of counts) {
                parts.push(`${cnt} ${name}${cnt > 1 ? 's' : ''}`)
            }
            message = `Detected ${parts.join(', ')}.`
        } else {
            candidates.sort((a, b) => {
                const as = typeof a.score === 'number' ? a.score : -1
                const bs = typeof b.score === 'number' ? b.score : -1
                return bs - as
            })
            const best = candidates[0]
            const name = best.label!
            const conf = typeof best.score === 'number' ? ` ${(best.score * 100).toFixed(0)}%` : ''
            message = includeConfidenceInMessage
                ? `Detected ${name}${conf ? `, ${conf}` : ''}.`
                : `Detected ${name}.`
            const key = getIdKey(best.id as any)
            if (key) chosenKey = key
        }

        lastGlobalSpokenAtRef.current = now
        if (useTTS) {
            Promise.resolve(speakTTS(message)).catch(() => { })
        } else {
            speakA11y(message)
        }

        if (chosenKey) {
            lastAnnouncedAtRef.current.set(chosenKey, now)
        }

        if (__DEV__) {
            console.log('[Notifier] spoke:', {
                message,
                candidates: candidates.slice(0, 3).map(c => ({
                    id: c.id, label: c.label, score: c.score
                }))
            })
        }
    }, [speakA11y])
}