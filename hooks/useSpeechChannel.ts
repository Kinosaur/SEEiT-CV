import {
    MIN_MAJOR_INTERVAL_MS,
    MIN_MINOR_INTERVAL_MS,
    SPEECH_INTERRUPT_GRACE_MS,
} from '@/constants/detection';
import { SpeechSupervisor, type SpeechPriority } from '@/services/speechSupervisor';
import { ttsSpeak, ttsStop } from '@/services/tts';
import { estimateSpeechDurationMs, postPhraseSanitize } from '@/utils/text';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

type NotifyFn = (items: { id: string; label: string; score: number }[]) => void;

type UseSpeechChannelOptions = {
    active: boolean;
    speakAggregateViaNotifier?: boolean;
    dupA11ySuppressMs?: number;
    notifyDetections: NotifyFn;
};

export function useSpeechChannel(opts: UseSpeechChannelOptions) {
    const { active, speakAggregateViaNotifier = false, dupA11ySuppressMs = 900, notifyDetections } = opts;

    const lastA11yRef = React.useRef<{ phrase: string; ts: number }>({ phrase: '', ts: 0 });
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
                ttsSpeak(clean, {
                    utteranceId,
                    onDone: (id) => speechSupervisorRef.current?.notifyDone(id),
                    onError: (id) => speechSupervisorRef.current?.notifyDone(id),
                }).catch(() => {
                    speechSupervisorRef.current?.notifyDone(utteranceId);
                });

                if (speakAggregateViaNotifier) {
                    notifyDetections([{ id: 'speech:aggregate', label: clean, score: 0.99 }]);
                } else {
                    const now = Date.now();
                    if (lastA11yRef.current.phrase === clean && (now - lastA11yRef.current.ts) < dupA11ySuppressMs) {
                        console.log(`[SpeechSkipDup] suppressed a11y repeat phrase="${clean}"`);
                    } else {
                        AccessibilityInfo.announceForAccessibility(clean);
                        lastA11yRef.current = { phrase: clean, ts: now };
                    }
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