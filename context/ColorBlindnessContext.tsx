import { COLOR_BLINDNESS_MAP } from '@/constants/colorBlindness';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY_TYPE = 'user_color_blindness_type_v1';
const STORAGE_KEY_INTENSITY = 'user_color_blindness_intensity_v1';

interface ColorBlindnessContextValue {
    selectedType: string | null;
    setSelectedType: (key: string) => Promise<void>;
    clearType: () => Promise<void>;
    loading: boolean;
    valid: boolean; // true if selectedType is a known key
    // New:
    intensity: number; // 1..5, 1 = neutral
    setIntensity: (value: number) => Promise<void>;
    strength: number; // derived: (intensity - 1) / 4 in [0,1]
    resetIntensityToDefault: () => Promise<void>;
}

const DEFAULT_INTENSITY = 1;
const MIN_INTENSITY = 1;
const MAX_INTENSITY = 5;

const ColorBlindnessContext = createContext<ColorBlindnessContextValue | undefined>(undefined);

export function ColorBlindnessProvider({ children }: { children: ReactNode }) {
    const [selectedType, setSelectedTypeState] = useState<string | null>(null);
    const [intensity, setIntensityState] = useState<number>(DEFAULT_INTENSITY);
    const [loading, setLoading] = useState(true);
    const [loadedIntensity, setLoadedIntensity] = useState(false);

    // Load from storage initially
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const [storedType, storedIntensity] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEY_TYPE),
                    AsyncStorage.getItem(STORAGE_KEY_INTENSITY),
                ]);
                if (!mounted) return;
                if (storedType) setSelectedTypeState(storedType);
                if (storedIntensity) {
                    const parsed = parseInt(storedIntensity, 10);
                    if (!Number.isNaN(parsed) && parsed >= MIN_INTENSITY && parsed <= MAX_INTENSITY) {
                        setIntensityState(parsed);
                    }
                }
                setLoadedIntensity(true);
            } catch {
                if (mounted) setLoadedIntensity(true);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    const persistIntensity = useCallback(async (val: number) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEY_INTENSITY, String(val));
        } catch {
            // ignore persistence error
        }
    }, []);

    const setIntensity = useCallback(async (value: number) => {
        if (Number.isNaN(value)) return;
        const clamped = Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, value));
        setIntensityState(clamped);
        persistIntensity(clamped).catch(() => { });
    }, [persistIntensity]);

    const resetIntensityToDefault = useCallback(async () => {
        setIntensityState(DEFAULT_INTENSITY);
        persistIntensity(DEFAULT_INTENSITY).catch(() => { });
    }, [persistIntensity]);

    const setSelectedType = useCallback(async (key: string) => {
        if (!COLOR_BLINDNESS_MAP[key]) {
            throw new Error(`Invalid color blindness type key: ${key}`);
        }
        const switching = key !== selectedType;
        setSelectedTypeState(key);
        try {
            await AsyncStorage.setItem(STORAGE_KEY_TYPE, key);
        } catch {
            // ignore
        }
        // Reset intensity when type changes
        if (switching) {
            await resetIntensityToDefault();
        }
    }, [selectedType, resetIntensityToDefault]);

    const clearType = useCallback(async () => {
        setSelectedTypeState(null);
        try {
            await AsyncStorage.removeItem(STORAGE_KEY_TYPE);
        } catch {
            // ignore
        }
        // Do not reset intensity here per spec; only on type change.
    }, []);

    const strength = (intensity - 1) / 4; // 1->0.0 ... 5->1.0

    const value: ColorBlindnessContextValue = {
        selectedType,
        setSelectedType,
        clearType,
        loading: loading || !loadedIntensity,
        valid: !!(selectedType && COLOR_BLINDNESS_MAP[selectedType]),
        intensity,
        setIntensity,
        strength,
        resetIntensityToDefault,
    };

    return (
        <ColorBlindnessContext.Provider value={value}>
            {children}
        </ColorBlindnessContext.Provider>
    );
}

export function useColorBlindness() {
    const ctx = useContext(ColorBlindnessContext);
    if (!ctx) {
        throw new Error('useColorBlindness must be used within ColorBlindnessProvider');
    }
    return ctx;
}