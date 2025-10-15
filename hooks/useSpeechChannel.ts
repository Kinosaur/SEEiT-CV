import {
    MIN_MAJOR_INTERVAL_MS,
    MIN_MINOR_INTERVAL_MS,
    SPEECH_INTERRUPT_GRACE_MS,
} from '@/constants/detection';
import { SpeechSupervisor, type SpeechPriority } from '@/services/speechSupervisor';
import { ttsSpeak, ttsStop } from '@/services/tts';
import { estimateSpeechDurationMs, postPhraseSanitize } from '@/utils/text';
import React from 'react';

type NotifyFn = (items: { id: string; label: string; score: number }[]) => void;

type UseSpeechChannelOptions = {
    active: boolean;
    speakAggregateViaNotifier?: boolean;
    dupA11ySuppressMs?: number; // kept for API compatibility, no longer used in this file
    notifyDetections: NotifyFn;
};

export function useSpeechChannel(opts: UseSpeechChannelOptions) {
    const { active, speakAggregateViaNotifier = false, notifyDetections } = opts;

    const speechSupervisorRef = React.useRef<SpeechSupervisor | null>(null);

    if (!speechSupervisorRef.current) {
        speechSupervisorRef.current = new SpeechSupervisor({
            estimateMs: estimateSpeechDurationMs,
            interruptGraceMs: SPEECH_INTERRUPT_GRACE_MS,
            minMajorIntervalMs: MIN_MAJOR_INTERVAL_MS,
            minMinorIntervalMs: MIN_MINOR_INTERVAL_MS,
            fallbackTimer: true,
            onSpeak: (rawPhrase, utteranceId, priority) => {
                const clean = postPhraseSanitize(rawPhrase);
                const iso = new Date().toISOString();
                console.log(`[Speech] ${iso} priority=${priority} id=${utteranceId} phrase="${clean}"`);

                // Speak via TTS only. Do NOT also announce for accessibility here to avoid double-speak with TalkBack.
                ttsSpeak(clean, {
                    utteranceId,
                    onDone: (id) => speechSupervisorRef.current?.notifyDone(id),
                    onError: (id) => speechSupervisorRef.current?.notifyDone(id),
                }).catch(() => {
                    speechSupervisorRef.current?.notifyDone(utteranceId);
                });

                // Optional: aggregate/log elsewhere if desired.
                if (speakAggregateViaNotifier) {
                    // Note: This does NOT trigger speech by itself; it's a callback for telemetry/aggregation.
                    notifyDetections([{ id: 'speech:aggregate', label: clean, score: 0.99 }]);
                }
            },
        });
    }

    React.useEffect(() => {
        if (!active) {
            ttsStop().catch(() => { });
            speechSupervisorRef.current?.notifyStopped();
        }
    }, [active]);

    const requestSpeak = React.useCallback((phrase: string, priority: SpeechPriority) => {
        speechSupervisorRef.current?.requestSpeak(phrase, priority);
    }, []);

    const stopSpeech = React.useCallback(() => {
        ttsStop().catch(() => { });
        speechSupervisorRef.current?.notifyStopped();
    }, []);

    return { requestSpeak, stopSpeech };
}

export default useSpeechChannel;