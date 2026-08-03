import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Variant = 'warning' | 'info' | 'success' | 'neutral';

const VARIANT_COLORS: Record<Variant, { bg: string; text: string; border?: string }> = {
  warning: { bg: colors.warningBg, text: colors.warning },
  info: { bg: '#eef2fd', text: colors.primary },
  success: { bg: colors.successBg, text: colors.success },
  neutral: { bg: colors.bg, text: colors.textMuted, border: colors.border },
};

export function Badge({ label, variant = 'neutral' }: { label: string; variant?: Variant }) {
  const { bg, text, border } = VARIANT_COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border ?? bg }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
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
