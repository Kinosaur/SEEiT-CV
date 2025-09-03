import { COLOR_BLINDNESS_MAP } from '@/constants/colorBlindness';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'user_color_blindness_type_v1';

interface ColorBlindnessContextValue {
    selectedType: string | null;
    setSelectedType: (key: string) => Promise<void>;
    clearType: () => Promise<void>;
    loading: boolean;
    valid: boolean; // true if selectedType is a known key
}

const ColorBlindnessContext = createContext<ColorBlindnessContextValue | undefined>(undefined);

export function ColorBlindnessProvider({ children }: { children: ReactNode }) {
    const [selectedType, setSelectedTypeState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Load from storage initially
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (mounted && stored) {
                    setSelectedTypeState(stored);
                }
            } catch {
                // swallow; we can choose to log if needed
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const setSelectedType = useCallback(async (key: string) => {
        // Validate key before storing
        if (!COLOR_BLINDNESS_MAP[key]) {
            throw new Error(`Invalid color blindness type key: ${key}`);
        }
        setSelectedTypeState(key);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, key);
        } catch {
            // Decide: ignore vs revert. Keep it simple: ignore, state already updated.
        }
    }, []);

    const clearType = useCallback(async () => {
        setSelectedTypeState(null);
        try {
            await AsyncStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    }, []);

    const value: ColorBlindnessContextValue = {
        selectedType,
        setSelectedType,
        clearType,
        loading,
        valid: !!(selectedType && COLOR_BLINDNESS_MAP[selectedType]),
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