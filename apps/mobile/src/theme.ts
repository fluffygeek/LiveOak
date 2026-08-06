/** Shared design tokens, mirroring apps/admin-web's globals.css palette so the two clients feel consistent. */
export const colors = {
  bg: '#f7f8fa',
  surface: '#ffffff',
  border: '#e2e5ea',
  // Meets ~3:1 against both bg and surface (WCAG 1.4.11 non-text contrast) — use this,
  // not `border`, for any edge that's the only cue a control exists (chip/input/card
  // outlines), so boundaries stay visible in bright outdoor light.
  borderStrong: '#8a93a3',
  text: '#1a1d23',
  textMuted: '#667085',
  primary: '#2952cc',
  primaryDark: '#1f3fa3',
  danger: '#b42318',
  dangerBg: '#fef3f2',
  success: '#067647',
  successBg: '#ecfdf3',
  warning: '#b45309',
  warningBg: '#fffaeb',
  info: '#2952cc',
  infoBg: '#eef2fd',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = 8;

/** iOS HIG / Material minimum recommended touch target — every Pressable/input should hit this. */
export const minTouchTarget = 44;
