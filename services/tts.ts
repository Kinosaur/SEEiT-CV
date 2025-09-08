import { Platform } from 'react-native'
import Tts, { Voice } from 'react-native-tts'

type InitResult = {
    cleanup: () => void
}

// Change this to 'th-TH' later if you want Thai by default.
const PREFERRED_LANG = 'en-US'

/**
 * Initializes the TTS engine, applies sane Android defaults, and registers log listeners.
 * - Handles missing engine on Android (prompts install).
 * - Sets default rate/pitch and enables ducking (Android).
 * - Chooses a local (offline) voice for the preferred language when available.
 * - Registers event listeners and returns a cleanup to stop any pending speech.
 *
 * Safe to call once on app start.
 */
export async function initTTS(): Promise<InitResult> {
    // Ensure engine exists/ready
    try {
        await Tts.getInitStatus()
    } catch (err: any) {
        if (err?.code === 'no_engine' && Platform.OS === 'android') {
            console.warn('[TTS] No TTS engine. Prompting install...')
            try {
                await Tts.requestInstallEngine()
            } catch {
                console.warn('[TTS] Failed to request engine install.')
            }
        } else {
            console.warn('[TTS] getInitStatus error:', err)
        }
        // Continue; speak() re-checks readiness.
    }

    // Android: lower other apps while speaking
    if (Platform.OS === 'android' && typeof (Tts as any).setDucking === 'function') {
        try {
            Tts.setDucking(true)
        } catch (e) {
            console.warn('[TTS] setDucking failed:', e)
        }
    }

    // Default voice parameters (conservative & intelligible)
    try {
        Tts.setDefaultRate(0.4)
        Tts.setDefaultPitch(1.0)
    } catch (e) {
        console.warn('[TTS] Failed to set default rate/pitch:', e)
    }

    // Try to pick a local voice for the preferred language
    await trySelectPreferredLocalVoice(PREFERRED_LANG)

    // Event listeners for diagnostics (remove or silence in production)
    try { Tts.addEventListener('tts-start', (e) => console.log('[TTS] start', e)) } catch { }
    try { Tts.addEventListener('tts-progress', (_e) => { /* verbose */ }) } catch { }
    try { Tts.addEventListener('tts-finish', (e) => console.log('[TTS] finish', e)) } catch { }
    try { Tts.addEventListener('tts-cancel', (e) => console.log('[TTS] cancel', e)) } catch { }

    // (Optional) Log voices on Android for debugging
    if (Platform.OS === 'android') {
        try {
            const voices: Voice[] = await Tts.voices()
            const installed = voices.filter(v => !v.notInstalled)
            console.log('[TTS] voices(installed):', installed.map(v => ({
                id: v.id, lang: v.language, latency: v.latency, net: v.networkConnectionRequired
            })))
        } catch { }
    }

    const cleanup = () => {
        // Stop/flush any pending speech to avoid leaks on teardown
        Tts.stop().catch(() => { })
    }

    return { cleanup }
}

async function trySelectPreferredLocalVoice(lang: string) {
    try {
        const voices: Voice[] = await Tts.voices()
        const installed = voices.filter(v => !v.notInstalled)
        // Prefer local voices in the target language (networkConnectionRequired === false)
        const localLangVoices = installed.filter(
            v => v.language?.toLowerCase() === lang.toLowerCase() && v.networkConnectionRequired !== true
        )
        // Heuristic: prefer ids that end with "-local"
        const pick =
            localLangVoices.find(v => /-local$/i.test(v.id)) ||
            localLangVoices[0] ||
            // Fallback: any local English voice if preferred lang not found
            installed.find(v => v.language?.startsWith('en') && v.networkConnectionRequired !== true) ||
            installed[0]

        if (pick) {
            // Set language first; some platforms require language to match the voice
            try { await Tts.setDefaultLanguage(pick.language) } catch (e) {
                console.warn('[TTS] setDefaultLanguage failed:', e)
            }
            // Voice selection is best-effort on Android; may throw on older devices
            try { await Tts.setDefaultVoice(pick.id) } catch (e) {
                console.warn('[TTS] setDefaultVoice failed:', e)
            }
            console.log('[TTS] default voice selected:', { id: pick.id, lang: pick.language, net: pick.networkConnectionRequired })
        } else {
            // As a minimal baseline, try to set just the language
            try { await Tts.setDefaultLanguage(lang) } catch (e) {
                console.warn('[TTS] setDefaultLanguage (fallback) failed:', e)
            }
        }
    } catch (e) {
        console.warn('[TTS] trySelectPreferredLocalVoice error:', e)
    }
}

/**
 * Speak a line. Interrupts current speech by default.
 * Not wired into product flow beyond Phase 1 testing.
 */
export async function ttsSpeak(text: string, options?: Parameters<typeof Tts.speak>[1]) {
    // Ensure engine readiness each time (robust on Android)
    try {
        await Tts.getInitStatus()
    } catch (err: any) {
        if (err?.code === 'no_engine' && Platform.OS === 'android') {
            console.warn('[TTS] No engine. Prompting install...')
            try { await Tts.requestInstallEngine() } catch { }
        }
        // Best-effort continue
    }
    try { await Tts.stop() } catch { }
    return Tts.speak(text, options)
}

/** Stop and flush the queue. */
export function ttsStop() {
    return Tts.stop()
}