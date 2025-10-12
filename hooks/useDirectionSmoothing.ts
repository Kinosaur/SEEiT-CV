/* ================= Direction Smoothing Hook ================= */

import React from 'react';
import { DIR_STABLE_FRAMES, DIR_NULL_GRACE, DIR_CACHE_TTL_MS } from '@/constants/detection';

type DirCache = { 
    stable: string | null; 
    current: string | null; 
    count: number; 
    nullHold: number; 
    lastSeen: number 
};

export function useDirectionSmoothing() {
    const directionCacheRef = React.useRef<Map<number, DirCache>>(new Map());

    const smoothDirection = React.useCallback((id: number, rawDir: string | null, now: number): string | null => {
        if (id < 0) return rawDir;
        const cache = directionCacheRef.current;
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
        for (const [id, v] of Array.from(directionCacheRef.current.entries())) {
            if (now - v.lastSeen > DIR_CACHE_TTL_MS) directionCacheRef.current.delete(id);
        }
    }, []);

    const reset = React.useCallback(() => {
        directionCacheRef.current.clear();
    }, []);

    return { smoothDirection, purgeDirCache, reset };
}
