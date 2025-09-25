import Tts from 'react-native-tts';

type SpeakOpts = {
    utteranceId?: string;
    onDone?: (id: string) => void;
    onError?: (id: string, err?: any) => void;
    rate?: number;
    pitch?: number;
};

let initialized = false;

const pendingDone = new Map<string, (id: string) => void>();
const pendingErr = new Map<string, (id: string, err?: any) => void>();

export async function initTTS() {
    if (initialized) return { cleanup: () => { } };
    initialized = true;
    try { await Tts.getInitStatus(); } catch { }
    try {
        await Tts.setDefaultRate(0.5, true);
        await Tts.setDefaultPitch(1.0);
    } catch { }

    const finishSub = Tts.addEventListener('tts-finish', (e: any) => {
        const id = e?.utteranceId;
        if (!id) return;
        pendingDone.get(id)?.(id);
        pendingDone.delete(id);
        pendingErr.delete(id);
    });
    const cancelSub = Tts.addEventListener('tts-cancel', (e: any) => {
        const id = e?.utteranceId;
        if (!id) return;
        pendingDone.get(id)?.(id);
        pendingDone.delete(id);
        pendingErr.delete(id);
    });
    const errorSub = Tts.addEventListener('tts-error', (e: any) => {
        const id = e?.utteranceId;
        if (!id) return;
        pendingErr.get(id)?.(id, e);
        pendingErr.delete(id);
        pendingDone.delete(id);
    });

    const cleanup = () => {
        // @ts-ignore
        finishSub?.remove?.();
        // @ts-ignore
        cancelSub?.remove?.();
        // @ts-ignore
        errorSub?.remove?.();
    };
    return { cleanup };
}

export function ttsSpeak(
    text: string,
    opts: SpeakOpts = {}
): Promise<{ utteranceId: string }> {
    const utteranceId = opts.utteranceId || 'utt_' + Math.random().toString(36).slice(2, 10);
    return new Promise((resolve) => {
        pendingDone.set(utteranceId, (id) => {
            opts.onDone?.(id);
            resolve({ utteranceId: id });
        });
        pendingErr.set(utteranceId, (id, err) => {
            opts.onError?.(id, err);
            resolve({ utteranceId: id });
        });

        try {
            // optional: do not interrupt existing if you want overlap (remove Tts.stop)
            Tts.stop().catch(() => { });
            const speakOptions: any = { utteranceId };
            if (typeof opts.rate === 'number') speakOptions.rate = opts.rate;
            if (typeof opts.pitch === 'number') speakOptions.pitch = opts.pitch;
            Tts.speak(text, speakOptions);
        } catch (e) {
            pendingDone.delete(utteranceId);
            pendingErr.delete(utteranceId);
            opts.onError?.(utteranceId, e);
            resolve({ utteranceId });
        }
    });
}

export async function ttsStop() {
    try { await Tts.stop(); } catch { }
}