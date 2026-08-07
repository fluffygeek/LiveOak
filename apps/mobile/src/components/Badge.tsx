import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Variant = 'warning' | 'info' | 'success' | 'neutral' | 'danger';

// Every variant pairs its color with a distinct glyph so meaning never rests on color alone
// (colorblind-safe, and legible in bright sunlight where hue is hard to judge).
const VARIANT_COLORS: Record<Variant, { bg: string; text: string; border?: string; icon: string }> = {
  warning: { bg: colors.warningBg, text: colors.warning, icon: '⚠' },
  info: { bg: colors.infoBg, text: colors.primary, icon: 'ℹ' },
  success: { bg: colors.successBg, text: colors.success, icon: '✓' },
  neutral: { bg: colors.bg, text: colors.textMuted, border: colors.border, icon: '' },
  danger: { bg: colors.dangerBg, text: colors.danger, icon: '✕' },
};

export function Badge({ label, variant = 'neutral' }: { label: string; variant?: Variant }) {
  const { bg, text, border, icon } = VARIANT_COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border ?? bg }]}>
      <Text style={[styles.label, { color: text }]}>
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
