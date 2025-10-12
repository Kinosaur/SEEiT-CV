import {
    DIST_CAT_CACHE_TTL_MS,
    DIST_CAT_NULL_GRACE,
    DIST_CAT_STABLE_FRAMES,
} from '@/constants/detection';
import React from 'react';

// Distance category type used by detections ('near' | 'mid' | 'far' | 'unknown')
export type DistCat = 'near' | 'mid' | 'far' | 'unknown';
export type StableDistCat = DistCat | null;

type DistCache = {
    stable: StableDistCat;
    current: StableDistCat;
    count: number;     // consecutive frames for current
    nullHold: number;  // grace frames allowed for nulls before clearing stable
    lastSeen: number;
};

export function useDistanceCategorySmoothing() {
    const cacheRef = React.useRef<Map<number, DistCache>>(new Map());

    const smoothDistCat = React.useCallback(
        (id: number, rawCat: StableDistCat, now: number): StableDistCat => {
            if (id < 0) return rawCat;
            const cache = cacheRef.current;
            let entry = cache.get(id);
            if (!entry) {
                entry = {
                    stable: rawCat,
                    current: rawCat,
                    count: 1,
                    nullHold: rawCat ? 0 : 1,
                    lastSeen: now,
                };
                cache.set(id, entry);
                return rawCat;
            }

            entry.lastSeen = now;

            if (rawCat === entry.current) {
                entry.count += 1;
            } else {
                entry.current = rawCat;
                entry.count = 1;
            }

            if (rawCat == null) {
                // Allow brief missing/unstable frames without dropping stable immediately
                if (entry.stable) {
                    entry.nullHold += 1;
                    if (entry.nullHold > DIST_CAT_NULL_GRACE) entry.stable = null;
                }
            } else {
                entry.nullHold = 0;
                if (entry.count >= DIST_CAT_STABLE_FRAMES) {
                    entry.stable = rawCat;
                }
            }

            return entry.stable ?? rawCat;
        },
        []
    );

    const purgeDistCache = React.useCallback((now: number) => {
        const cache = cacheRef.current;
        for (const [id, v] of Array.from(cache.entries())) {
            if (now - v.lastSeen > DIST_CAT_CACHE_TTL_MS) cache.delete(id);
        }
    }, []);

    const reset = React.useCallback(() => {
        cacheRef.current.clear();
    }, []);

    return { smoothDistCat, purgeDistCache, reset };
}