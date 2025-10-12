import { DIR_CACHE_TTL_MS, DIR_NULL_GRACE, DIR_STABLE_FRAMES } from '@/constants/detection';
import React from 'react';

export type StableDirection = string | null;

type DirCache = {
    stable: StableDirection;
    current: StableDirection;
    count: number;
    nullHold: number;
    lastSeen: number;
};

export function useDirectionSmoothing() {
    const cacheRef = React.useRef<Map<number, DirCache>>(new Map());

    const smoothDirection = React.useCallback((id: number, rawDir: StableDirection, now: number): StableDirection => {
        if (id < 0) return rawDir;
        const cache = cacheRef.current;
        let entry = cache.get(id);
        if (!entry) {
            entry = { stable: rawDir, current: rawDir, count: 1, nullHold: rawDir ? 0 : 1, lastSeen: now };
            cache.set(id, entry);
            return rawDir;
        }
        entry.lastSeen = now;
        if (rawDir === entry.current) {
            entry.count += 1;
        } else {
            entry.current = rawDir;
            entry.count = 1;
        }
        if (rawDir == null) {
            if (entry.stable) {
                entry.nullHold += 1;
                if (entry.nullHold > DIR_NULL_GRACE) entry.stable = null;
            }
        } else {
            entry.nullHold = 0;
            if (entry.count >= DIR_STABLE_FRAMES) entry.stable = rawDir;
        }
        return entry.stable ?? rawDir;
    }, []);

    const purgeDirCache = React.useCallback((now: number) => {
        const cache = cacheRef.current;
        for (const [id, v] of Array.from(cache.entries())) {
            if (now - v.lastSeen > DIR_CACHE_TTL_MS) cache.delete(id);
        }
    }, []);

    const reset = React.useCallback(() => {
        cacheRef.current.clear();
    }, []);

    return { smoothDirection, purgeDirCache, reset };
}