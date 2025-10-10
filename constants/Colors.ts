/**
 * Accessible Camera App Color Palette (Light & Dark)
 * Colorblind-friendly, accessibility-first color palette for vision-impaired users.
 * All colors chosen for high contrast, colorblind safety, and clarity.
 * Reference: WebAIM, Atkinson Hyperlegible, Material Design Accessibility, colorblind-safe palette.
 */

// Light mode
const backgroundLight = '#F9FAFB'; // Soft White
const surfaceLight = '#F3F4F6'; // Very Light Gray
const textLight = '#1A1A1A'; // Nearly Black
const textSecondaryLight = '#414141'; // Dark Gray
const placeholderLight = '#767676'; // Medium Gray
const dividerLight = '#D1D5DB'; // Pale Gray
const accentLight = '#2563EB'; // Deep Blue
const accentSecondaryLight = '#F59E42'; // Vivid Orange
const successLight = '#059669'; // Teal
const warningLight = '#FACC15'; // Golden Yellow
const errorLight = '#D72660'; // Strong Magenta
const disabledLight = '#E5E7EB'; // Pale Gray
const shutterLight = '#111827'; // Black
const focusLight = '#6366F1'; // Indigo

// Dark mode
const backgroundDark = '#18181B'; // Deep Charcoal
const surfaceDark = '#232326'; // Slightly Lighter Black
const textDark = '#FFFFFF'; // White
const textSecondaryDark = '#D1D5DB'; // Light Gray
const placeholderDark = '#A3A3A3'; // Medium Gray
const dividerDark = '#323232'; // Dark Gray
const accentDark = '#60A5FA'; // Bright Blue
const accentSecondaryDark = '#FDBA74'; // Vivid Orange
const successDark = '#34D399'; // Aqua
const warningDark = '#FDE047'; // Lemon Yellow
const errorDark = '#FB7185'; // Strong Pink
const disabledDark = '#2D2D2D'; // Dark Gray
const shutterDark = '#F3F4F6'; // White
const focusDark = '#818CF8'; // Light Indigo

export const Colors = {
  light: {
    background: backgroundLight,
    surface: surfaceLight,
    text: textLight,
    textSecondary: textSecondaryLight,
    placeholder: placeholderLight,
    divider: dividerLight,
    accent: accentLight,
    secondaryAccent: accentSecondaryLight,
    success: successLight,
    warning: warningLight,
    error: errorLight,
    disabled: disabledLight,
    shutter: shutterLight,
    focus: focusLight,
    // Icon and tab colors use accent for clarity
    icon: accentLight,
    tabIconDefault: accentLight,
    tabIconSelected: focusLight,
    // NEW foreground tokens for colored backgrounds
    onAccent: '#FFFFFF',
    onError: '#FFFFFF',
  },
  dark: {
    background: backgroundDark,
    surface: surfaceDark,
    text: textDark,
    textSecondary: textSecondaryDark,
    placeholder: placeholderDark,
    divider: dividerDark,
    accent: accentDark,
    secondaryAccent: accentSecondaryDark,
    success: successDark,
    warning: warningDark,
    error: errorDark,
    disabled: disabledDark,
    shutter: shutterDark,
    focus: focusDark,
    icon: accentDark,
    tabIconDefault: accentDark,
    tabIconSelected: focusDark,
    // NEW foreground tokens for colored backgrounds
    onAccent: '#FFFFFF',
    onError: '#FFFFFF',
  },
};