export type SpeechPriority = 'critical' | 'major' | 'minor';

interface SpeechOptions {
    estimateMs: (phrase: string) => number;
    onSpeak: (phrase: string, utteranceId: string, priority: SpeechPriority) => void;
    interruptGraceMs: number;
    minMajorIntervalMs: number;
    minMinorIntervalMs: number;
    fallbackTimer: boolean;
}

interface InFlight {
    phrase: string;
    priority: SpeechPriority;
    startedAt: number;
    expectedDone: number;
    utteranceId: string;
    timer: any | null;
    usingFallback: boolean;
}

export class SpeechSupervisor {
    private inFlight: InFlight | null = null;
    private pending: { phrase: string; priority: SpeechPriority } | null = null;
    private lastCompletedAt = 0;
    private readonly opt: SpeechOptions;

    constructor(opt: SpeechOptions) {
        this.opt = opt;
    }

    private genId() {
        return 'utt_' + Math.random().toString(36).slice(2, 10);
    }

    private finishCurrent(now: number) {
        if (this.inFlight) {
            if (this.inFlight.timer) clearTimeout(this.inFlight.timer);
            this.lastCompletedAt = now;
            this.inFlight = null;
        }
    }

    public notifyStopped(now: number = Date.now()) {
        this.finishCurrent(now);
        this.drainPending();
    }

    public notifyDone(utteranceId?: string) {
        const now = Date.now();
        if (!this.inFlight) return;
        if (utteranceId && utteranceId !== this.inFlight.utteranceId) return;
        this.finishCurrent(now);
        this.drainPending();
    }

    private drainPending() {
        if (!this.pending) return;
        const { phrase, priority } = this.pending;
        this.pending = null;
        this.start(phrase, priority);
    }

    private start(phrase: string, priority: SpeechPriority) {
        if (!phrase.trim()) return;
        const now = Date.now();
        const dur = this.opt.estimateMs(phrase);
        const utteranceId = this.genId();
        const usingFallback = this.opt.fallbackTimer;
        const timer = usingFallback
            ? setTimeout(() => {
                if (this.inFlight && this.inFlight.utteranceId === utteranceId) {
                    this.finishCurrent(Date.now());
                    this.drainPending();
                }
            }, dur + 150)
            : null;

        this.inFlight = {
            phrase,
            priority,
            startedAt: now,
            expectedDone: now + dur,
            utteranceId,
            timer,
            usingFallback,
        };

        this.opt.onSpeak(phrase, utteranceId, priority);
    }

    public requestSpeak(phrase: string, priority: SpeechPriority) {
        const now = Date.now();
        if (!this.inFlight) {
            if (priority === 'major' && now - this.lastCompletedAt < this.opt.minMajorIntervalMs) {
                this.pending = { phrase, priority };
                return;
            }
            if (priority === 'minor' && now - this.lastCompletedAt < this.opt.minMinorIntervalMs) {
                return;
            }
            this.start(phrase, priority);
            return;
        }

        const elapsed = now - this.inFlight.startedAt;

        if (priority === 'critical') {
            if (elapsed >= this.opt.interruptGraceMs || this.inFlight.priority !== 'critical') {
                this.notifyStopped(now);
                this.start(phrase, priority);
            } else {
                this.pending = { phrase, priority };
            }
            return;
        }

        if (this.inFlight.priority === 'critical') {
            if (priority === 'major') this.pending = { phrase, priority };
            return;
        }

        if (priority === 'major') {
            this.pending = { phrase, priority };
            return;
        }

        if (!this.pending && this.inFlight.expectedDone - now < 500) {
            this.pending = { phrase, priority };
        }
    }
}