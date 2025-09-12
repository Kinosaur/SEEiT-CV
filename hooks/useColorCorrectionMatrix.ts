import { useColorBlindness } from '@/context/ColorBlindnessContext';
import { buildColorMatrix, ColorMatrix4x5 } from '@/utils/colorBlindnessMatrices';
import { useMemo } from 'react';

// Hook that exposes the current 4x5 color matrix based on selected type + intensity-derived strength.
// If no valid type, returns identity matrix (4x5).
const IDENTITY_4x5: ColorMatrix4x5 = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
];

export function useColorCorrectionMatrix(): ColorMatrix4x5 {
    const { selectedType, valid, strength } = useColorBlindness();
    return useMemo(() => {
        if (!valid || !selectedType) return IDENTITY_4x5;
        // Map selectedType → CvdType if your keys differ.
        return buildColorMatrix(selectedType as any, strength);
    }, [valid, selectedType, strength]);
}