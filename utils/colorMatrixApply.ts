// Utilities to apply a 4x5 color matrix to sRGB colors in JS (for preview/demo only).
// NOTE: This is not gamma-correct. The final GPU path should apply transforms in linear space.

export type ColorMatrix4x5 = number[]; // length 20, row-major

type RGB = { r: number; g: number; b: number };

// Clamp to [0, 255]
function clamp8(x: number): number {
    return Math.max(0, Math.min(255, Math.round(x)));
}

// Parse hex like "#RRGGBB" or "RRGGBB" into RGB
export function hexToRgb(hex: string): RGB {
    const s = hex.replace(/^#/, '');
    if (s.length !== 6) throw new Error(`hexToRgb expects 6-digit hex, got: ${hex}`);
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return { r, g, b };
}

export function rgbToHex({ r, g, b }: RGB): string {
    const to2 = (n: number) => n.toString(16).padStart(2, '0');
    return `#${to2(clamp8(r))}${to2(clamp8(g))}${to2(clamp8(b))}`;
}

// Apply 4x5 color matrix (row-major) to sRGB 0..255 inputs (naive sRGB, no gamma conversion).
// Matrix layout:
// [ r0 r1 r2 r3 r4,
//   g0 g1 g2 g3 g4,
//   b0 b1 b2 b3 b4,
//   a0 a1 a2 a3 a4 ]
export function applyColorMatrix4x5(rgb: RGB, m: ColorMatrix4x5): RGB {
    const r = rgb.r, g = rgb.g, b = rgb.b;
    const R = m[0] * r + m[1] * g + m[2] * b + m[3] * 0 + m[4] * 255;
    const G = m[5] * r + m[6] * g + m[7] * b + m[8] * 0 + m[9] * 255;
    const B = m[10] * r + m[11] * g + m[12] * b + m[13] * 0 + m[14] * 255;
    // alpha row ignored for swatches
    return { r: clamp8(R), g: clamp8(G), b: clamp8(B) };
}