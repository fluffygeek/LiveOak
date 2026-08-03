/** Shared design tokens, mirroring apps/admin-web's globals.css palette so the two clients feel consistent. */
export const colors = {
  bg: '#f7f8fa',
  surface: '#ffffff',
  border: '#e2e5ea',
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
