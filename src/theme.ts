export const Colors = {
  bg: '#0A0C0F',
  surface: '#111418',
  surface2: '#181C22',
  surface3: '#1F242C',
  border: '#232830',
  borderLight: '#2E3540',
  accent: '#00E5A0',
  accentDim: 'rgba(0, 229, 160, 0.12)',
  accentBorder: 'rgba(0, 229, 160, 0.25)',
  gold: '#FFB830',
  goldDim: 'rgba(255, 184, 48, 0.12)',
  goldBorder: 'rgba(255, 184, 48, 0.25)',
  blue: '#4F8EF7',
  blueDim: 'rgba(79, 142, 247, 0.12)',
  text: '#F0F2F5',
  textSecondary: '#A8B3C0',
  textMuted: '#7A8494',
  danger: '#FF5A5A',
  dangerDim: 'rgba(255, 90, 90, 0.12)',
  success: '#00E5A0',
  warning: '#FFB830',
};

export const Typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: Colors.text },
  h2: { fontSize: 22, fontWeight: '600' as const, color: Colors.text },
  h3: { fontSize: 18, fontWeight: '600' as const, color: Colors.text },
  h4: { fontSize: 15, fontWeight: '600' as const, color: Colors.text },
  body: { fontSize: 14, fontWeight: '400' as const, color: Colors.text },
  bodySmall: { fontSize: 12, fontWeight: '400' as const, color: Colors.textSecondary },
  label: { fontSize: 11, fontWeight: '500' as const, color: Colors.textMuted, letterSpacing: 0.8 },
  mono: { fontSize: 12, fontFamily: 'monospace' as const, color: Colors.text },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const Radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};
