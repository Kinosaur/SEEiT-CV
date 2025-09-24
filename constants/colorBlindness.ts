// Central definitions for color blindness types.
// Keep descriptions short; expand in onboarding screen if needed.

export interface ColorBlindnessTypeDef {
    key: string;
    name: string;
    description: string;
}

export const COLOR_BLINDNESS_TYPES: ColorBlindnessTypeDef[] = [
    { key: 'color_finder', name: 'Color Finder', description: 'Help you find colors' },
    // { key: 'protanopia', name: 'Protanopia', description: 'Reduced sensitivity to reds' },
    // { key: 'deuteranopia', name: 'Deuteranopia', description: 'Reduced sensitivity to greens' },
    // { key: 'tritanopia', name: 'Tritanopia', description: 'Reduced sensitivity to blues' },
    // { key: 'monochromacy', name: 'Monochromacy', description: 'Primarily perceives lightness' },
    // { key: 'normal', name: 'Normal Vision', description: 'No diagnosed color blindness' },
];

// Convenience map for quick lookup (avoid rebuilding each time)
export const COLOR_BLINDNESS_MAP: Record<string, ColorBlindnessTypeDef> =
    COLOR_BLINDNESS_TYPES.reduce((acc, t) => {
        acc[t.key] = t;
        return acc;
    }, {} as Record<string, ColorBlindnessTypeDef>);