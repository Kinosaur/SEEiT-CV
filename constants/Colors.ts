/**
 * Colorblind-friendly, accessibility-first color palette for vision-impaired users.
 * Uses colors distinguishable under Protanopia, Deuteranopia, and Tritanopia.
 * Reference: WebAIM, Atkinson Hyperlegible, Material Design Accessibility, colorblind-safe palette.
 */

// Light and dark mode backgrounds
const backgroundLight = '#FAFAFA'; // very light gray
const backgroundDark = '#181A1B';  // very dark gray

// Primary text colors
const textLight = '#212121'; // near-black
const textDark = '#FFFFFF';  // white

// Accent and status colors (colorblind-safe)
const accentLight = '#1F449C'; // blue (safe for all types)
const accentDark = '#3D65A5';  // lighter blue for dark mode
const secondaryAccent = '#F05039'; // orange-red (safe for all types)
const errorLight = '#E57A77';  // salmon (distinguishable from green/blue)
const errorDark = '#EEBAB4';   // lighter salmon for dark mode
const successLight = '#3D65A5'; // blue (not green, safe for all types)
const successDark = '#7CA1CC';  // lighter blue for dark mode
const focusLight = '#FFB900';   // yellow (safe for all types)
const focusDark = '#FFD740';    // lighter yellow for dark mode

export const Colors = {
  light: {
    background: backgroundLight,
    text: textLight,
    accent: accentLight,
    secondaryAccent: secondaryAccent,
    error: errorLight,
    success: successLight,
    focus: focusLight,
    // Icon and tab colors use accent for clarity
    icon: accentLight,
    tabIconDefault: accentLight,
    tabIconSelected: focusLight,
  },
  dark: {
    background: backgroundDark,
    text: textDark,
    accent: accentDark,
    secondaryAccent: secondaryAccent,
    error: errorDark,
    success: successDark,
    focus: focusDark,
    icon: accentDark,
    tabIconDefault: accentDark,
    tabIconSelected: focusDark,
  },
};
