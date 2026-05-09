// FuelEquity — Global dark theme tokens
// Design reference: dark bg, green (#4ade80) primary, amber for pending, indigo for AI card

export const Colors = {
  // Backgrounds
  background: '#08080f',
  surface: '#11111c',
  surfaceElevated: '#181826',
  border: '#252538',

  // Brand green
  primary: '#4ade80',
  primaryDim: '#22c55e',
  primaryMuted: '#16a34a',
  primarySubtle: 'rgba(74, 222, 128, 0.12)',

  // Semantic
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  info: '#60a5fa',

  // AI insight card (indigo/purple)
  aiCardBg: 'rgba(99, 102, 241, 0.12)',
  aiCardBorder: '#6366f1',

  // Text
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#475569',
  textInverse: '#08080f',

  // Payment status
  paid: '#4ade80',
  paidBg: 'rgba(74, 222, 128, 0.15)',
  pending: '#fbbf24',
  pendingBg: 'rgba(251, 191, 36, 0.15)',

  // Tab bar
  tabActive: '#4ade80',
  tabInactive: '#475569',
  tabBar: '#0e0e1a',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.65)',
  shimmer: '#1c1c2e',
} as const;

export const FontFamily = {
  regular: 'System',
  medium: 'System',
  semibold: 'System',
  bold: 'System',
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  display: 38,
  hero: 48,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  section: 64,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 10,
  },
  green: {
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

const theme = { Colors, FontFamily, FontSize, FontWeight, Spacing, Radius, Shadow };
export default theme;
