export type RGB = { r: number; g: number; b: number }

export function srgbToLinear(v: number): number {
    const x = Math.max(0, Math.min(1, v))
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}
export function linearToSrgb(v: number): number {
    const x = Math.max(0, Math.min(1, v))
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

// Simple color name mapping for labels
export function nameColor(rgb: RGB): string {
    const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    const L = (max + min) / 2
    if (d < 0.02) return L < 0.15 ? 'black' : L > 0.85 ? 'white' : 'gray'
    let H = 0
    if (max === r) H = ((g - b) / d + (g < b ? 6 : 0))
    else if (max === g) H = (b - r) / d + 2
    else H = (r - g) / d + 4
    H *= 60
    if (H < 0) H += 360
    if (H < 25 || H >= 335) return 'red'
    if (H < 80) return 'yellow-green'
    if (H < 160) return 'green-cyan'
    if (H < 210) return 'cyan'
    if (H < 270) return 'blue'
    if (H < 335) return 'magenta'
    return 'color'
}