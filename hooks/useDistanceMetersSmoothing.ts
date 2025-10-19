import React from 'react';

type Conf = 'high' | 'med' | 'low' | undefined;

type Entry = {
    ema: number;         // exponential moving average
    shown?: number;      // last displayed value
    conf?: Conf;
    lastSeen: number;
};

const ALPHA = 0.35;              // JS-side EMA (native also smooths; this is extra gentle)
const TTL_MS = 9000;             // cache expiry similar to direction smoothing
const LOW_CONF_HIDE = true;      // hide meters when confidence is 'low'
const MIN_DELTA_NEAR = 0.5;      // meters: update threshold below 10m
const MIN_DELTA_FAR = 1.0;       // meters: update threshold at/above 10m

function quantize(v: number): number {
    return v < 10 ? Math.round(v * 2) / 2 : Math.round(v);
}
function thresholdFor(v: number): number {
    return v < 10 ? MIN_DELTA_NEAR : MIN_DELTA_FAR;
}

export function useDistanceMetersSmoothing() {
    const mapRef = React.useRef<Map<number, Entry>>(new Map());

    const smoothMeters = React.useCallback(
        (id: number, raw?: number, conf?: Conf, now: number = Date.now()): { display?: number; conf?: Conf } => {
            if (id == null || id < 0 || typeof raw !== 'number' || raw <= 0) {
                return { display: undefined, conf: undefined };
            }
            // Optionally hide low-confidence values altogether to avoid flicker
            if (LOW_CONF_HIDE && conf === 'low') {
                // keep existing entry but don't update shown
                const e = mapRef.current.get(id);
                if (e) e.lastSeen = now;
                return { display: undefined, conf };
            }

            let e = mapRef.current.get(id);
            if (!e) {
                const q = quantize(raw);
                e = { ema: raw, shown: q, conf, lastSeen: now };
                mapRef.current.set(id, e);
                return { display: q, conf };
            }

            e.lastSeen = now;
            // EMA update
            e.ema = ALPHA * raw + (1 - ALPHA) * e.ema;
            e.conf = conf;

            // Debounced display update only if the change exceeds threshold
            const prevShown = typeof e.shown === 'number' ? e.shown : undefined;
            const desired = quantize(e.ema);

            if (prevShown == null) {
                e.shown = desired;
            } else {
                const thr = thresholdFor(Math.min(prevShown, desired));
                if (Math.abs(desired - prevShown) >= thr) {
                    e.shown = desired;
                }
            }

            return { display: e.shown, conf: e.conf };
        },
        []
    );

    const purgeDistCache = React.useCallback((now: number = Date.now()) => {
        const m = mapRef.current;
        for (const [id, e] of Array.from(m.entries())) {
            if (now - e.lastSeen > TTL_MS) m.delete(id);
        }
    }, []);

    const reset = React.useCallback(() => {
        mapRef.current.clear();
    }, []);

    return { smoothMeters, purgeDistCache, reset };
}

export default useDistanceMetersSmoothing;