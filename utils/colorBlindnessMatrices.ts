// Color correction matrices for CVD based on Machado et al. (2009) as a pragmatic starting point.
// These are 3x3 RGB matrices for "full" correction. We will blend with identity by `strength` in [0,1].
// NOTE: Real-world “daltonization” often combines simulation + error redistribution; this keeps it simple.

export type CvdType = 'protanopia' | 'deuteranopia' | 'tritanopia';

// 3x3 matrices as row-major arrays
// Sources: Commonly used approximations derived from Machado’s model; values can be tuned later.
const PROTANOPIA_3x3: number[] = [
    0.0, 1.05118294, -0.05116099,
    0.0, 1.0, 0.0,
    0.0, 0.0, 1.0,
];

const DEUTERANOPIA_3x3: number[] = [
    1.0, 0.0, 0.0,
    1.05118294, 0.0, -0.05116099,
    0.0, 0.0, 1.0,
];

const TRITANOPIA_3x3: number[] = [
    1.0, 0.0, 0.0,
    0.0, 1.0, 0.0,
    -0.86744736, 1.86727089, 0.0,
];

// Identity 3x3
const IDENTITY_3x3: number[] = [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
];

// Map your selected type keys (COLOR_BLINDNESS_MAP keys) to CvdType here if they differ.
// For now assume your keys match: 'protanopia' | 'deuteranopia' | 'tritanopia'.
export function getBaseMatrix3x3(type: CvdType): number[] {
    switch (type) {
        case 'protanopia': return PROTANOPIA_3x3;
        case 'deuteranopia': return DEUTERANOPIA_3x3;
        case 'tritanopia': return TRITANOPIA_3x3;
        default: return IDENTITY_3x3;
    }
}

// Blend two 3x3 matrices: out = (1 - t) * A + t * B
function lerp3x3(A: number[], B: number[], t: number): number[] {
    const out = new Array(9);
    for (let i = 0; i < 9; i++) out[i] = A[i] + (B[i] - A[i]) * t;
    return out;
}

// Many renderers expect a 4x5 color matrix (Android/Skia/GPUImage-style) including bias.
// We’ll lift 3x3 into 4x5 with identity alpha and zero bias.
export type ColorMatrix4x5 = number[]; // length 20, row-major [Rrow(5), Grow(5), Brow(5), Arow(5)]

export function to4x5From3x3(m3: number[]): ColorMatrix4x5 {
    // [ r r r 0 0
    //   g g g 0 0
    //   b b b 0 0
    //   0 0 0 1 0 ]
    return [
        m3[0], m3[1], m3[2], 0, 0,
        m3[3], m3[4], m3[5], 0, 0,
        m3[6], m3[7], m3[8], 0, 0,
        0, 0, 0, 1, 0,
    ];
}

// Build a blended matrix for the given type and strength in [0,1].
// strength = 0 => identity; strength = 1 => full correction matrix.
export function buildColorMatrix(type: CvdType, strength: number): ColorMatrix4x5 {
    const s = Math.max(0, Math.min(1, strength));
    const base3 = getBaseMatrix3x3(type);
    const blended3 = lerp3x3(IDENTITY_3x3, base3, s);
    return to4x5From3x3(blended3);
}