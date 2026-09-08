/**
 * RetinaSaarthi Design System — "Vascular Cybernetics"
 *
 * Cyber-brutalist medical diagnostic interface.
 * Sharp edges (0px radius), cream heritage backgrounds,
 * crimson primary, editorial typography, micro-animations.
 */

export const Colors = {
  // Primary palette — crimson
  primary: '#C42B2B',
  primaryDark: '#9B1B1B',
  primaryLight: '#D94444',
  primaryMid: '#B83333',
  primaryFaded: 'rgba(196, 43, 43, 0.08)',

  // Accent — metallic gold
  accentGold: '#D4A853',
  accentGoldLight: 'rgba(212, 168, 83, 0.15)',
  accentGoldDark: '#B8903E',

  // Status colours
  success: '#2E7D5A',
  successLight: '#E8F5EF',
  warning: '#B85C00',
  warningLight: '#FFF3E5',
  danger: '#C0392B',
  dangerLight: '#FDECEA',
  info: '#1565A8',
  infoLight: '#E3EEFF',

  // Severity grade colours (Grade 0–4)
  grade0: '#2E7D5A',   // No DR — green
  grade1: '#2E7D5A',   // Mild — green
  grade2: '#B85C00',   // Moderate — amber
  grade3: '#C0392B',   // Severe — red
  grade4: '#7B1E1E',   // Proliferative — deep red

  // Neutral scale — warm cream/espresso
  neutral50:  '#FAF6EF',
  neutral100: '#F5EDE0',
  neutral200: '#E8DCC8',
  neutral300: '#D4C5A9',
  neutral400: '#B8A88A',
  neutral500: '#8C7A60',
  neutral600: '#5D4E37',
  neutral700: '#3D3222',
  neutral800: '#2C1810',
  neutral900: '#1A0E08',

  // Backgrounds — cream heritage
  background: '#F5EDE0',
  surface: '#FAF6EF',
  surfaceElevated: '#FFFFFF',
  surfaceDark: '#E8DCC8',

  // Text — espresso/brown
  textPrimary: '#2C1810',
  textSecondary: '#5D4E37',
  textMuted: '#8C7A60',
  textInverse: '#FAF6EF',
  textLink: '#C42B2B',

  // Borders — warm taupe
  border: '#D4C5A9',
  borderFocus: '#C42B2B',
  borderSubtle: '#E8DCC8',

  // Disabled
  disabled: '#D4C5A9',
  disabledText: '#B8A88A',
};

export const Typography = {
  // Font families — system fonts for offline reliability
  fontFamily: 'System',
  fontFamilyMono: 'monospace',

  // Scale
  xs:   10,
  sm:   12,
  base: 14,
  md:   16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,

  // Weights
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  heavy:    '800' as const,

  // Line heights
  tight:   1.25,
  normal:  1.5,
  relaxed: 1.75,

  // Letter spacing presets
  trackTight: -0.5,
  trackNormal: 0,
  trackWide: 1.5,
  trackUltraWide: 3,
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  base: 16,
  lg:  20,
  xl:  24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
};

// Brutalist — all sharp edges
export const BorderRadius = {
  sm:   0,
  md:   0,
  lg:   0,
  xl:   0,
  full: 0,
};

export const Shadows = {
  sm: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  glow: {
    shadowColor: '#C42B2B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
};

export const TouchTarget = {
  minHeight: 48,
  minWidth: 48,
};

// Animation presets for micro-animations
export const Animations = {
  springConfig: {
    tension: 180,
    friction: 12,
    useNativeDriver: true,
  },
  fadeInDuration: 400,
  staggerDelay: 80,
  pulseGlowDuration: 2000,
  scanLineDuration: 3000,
};

// Convenience re-export
const Theme = { Colors, Typography, Spacing, BorderRadius, Shadows, TouchTarget, Animations };
export default Theme;
