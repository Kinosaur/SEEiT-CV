type SpeakFn = (text: string) => Promise<any> | any
export type SpeechPriority = 'critical' | 'major' | 'minor'

interface SpeechOptions {
    estimateMs: (phrase: string) => number
    onSpeak: (phrase: string) => void   // calls notifier
    interruptGraceMs: number            // minimum ms before allowing interrupt
    minMajorIntervalMs: number
    minMinorIntervalMs: number
}

interface InFlight {
    phrase: string
    priority: SpeechPriority
    startedAt: number
    expectedDone: number
    timer: any
}

export class SpeechSupervisor {
    private inFlight: InFlight | null = null
    private pending: { phrase: string; priority: SpeechPriority } | null = null
    private lastCompletedAt = 0
    private readonly opt: SpeechOptions

    constructor(opt: SpeechOptions) {
        this.opt = opt
    }

    private finishCurrent(now: number) {
        if (this.inFlight) {
            this.lastCompletedAt = now
            if (this.inFlight.timer) clearTimeout(this.inFlight.timer)
            this.inFlight = null
        }
    }

    // Call when external system explicitly stops speech early
    public notifyStopped(now: number = Date.now()) {
        this.finishCurrent(now)
        // Attempt to play pending immediately if available
        this.drainPending()
    }

    private drainPending() {
        if (!this.pending) return
        const { phrase, priority } = this.pending
        this.pending = null
        this.start(phrase, priority)
    }

    private start(phrase: string, priority: SpeechPriority) {
        const now = Date.now()
        const dur = this.opt.estimateMs(phrase)
        this.inFlight = {
            phrase,
            priority,
            startedAt: now,
            expectedDone: now + dur,
            timer: setTimeout(() => {
                // Treat as completed
                this.finishCurrent(Date.now())
                this.drainPending()
            }, dur + 120) // small buffer
        }
        this.opt.onSpeak(phrase)
    }

    public requestSpeak(phrase: string, priority: SpeechPriority) {
        const now = Date.now()
        // If nothing playing -> speak
        if (!this.inFlight) {
            // Interval gating for major/minor
            if (priority === 'major' && now - this.lastCompletedAt < this.opt.minMajorIntervalMs) {
                this.pending = { phrase, priority }
                return
            }
            if (priority === 'minor' && now - this.lastCompletedAt < this.opt.minMinorIntervalMs) {
                // discard silently (can re-request later)
                return
            }
            this.start(phrase, priority)
            return
        }

        // Something is in flight
        const elapsed = now - this.inFlight.startedAt
        if (priority === 'critical') {
            if (elapsed >= this.opt.interruptGraceMs || this.inFlight.priority !== 'critical') {
                // Hard interrupt
                this.notifyStopped(now)
                this.start(phrase, priority)
            } else {
                // Not enough elapsed; queue override
                this.pending = { phrase, priority }
            }
            return
        }

        // Major or Minor while speaking
        if (this.inFlight.priority === 'critical') {
            // Let critical finish unless pending is also critical (handled above)
            if (priority === 'major') {
                this.pending = { phrase, priority }
            } else {
                // ignore minor during critical
            }
            return
        }

        if (priority === 'major') {
            // Do not interrupt; replace pending with latest major
            this.pending = { phrase, priority }
            return
        }

        // Minor: only queue if nothing else pending and enough time after expected end
        if (!this.pending) {
            // If expected end soon (< 500ms), queue; else ignore
            if (this.inFlight.expectedDone - now < 500) {
                this.pending = { phrase, priority }
            }
        }
    }
}