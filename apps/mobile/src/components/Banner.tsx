import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Tone = 'danger' | 'warning' | 'success' | 'info';

const TONE_STYLES: Record<Tone, { bg: string; border: string; text: string; icon: string }> = {
  danger: { bg: colors.dangerBg, border: colors.danger, text: colors.danger, icon: '⚠' },
  warning: { bg: colors.warningBg, border: colors.warning, text: colors.warning, icon: '⚠' },
  success: { bg: colors.successBg, border: colors.success, text: colors.success, icon: '✓' },
  info: { bg: colors.infoBg, border: colors.primary, text: colors.primary, icon: 'ℹ' },
};

/**
 * High-contrast, icon-led status banner. Used anywhere a technician needs to notice
 * feedback at a glance — errors, blocking conditions, confirmations — rather than a
 * thin line of colored text that's easy to miss in bright sunlight or a quick scan.
 */
export function Banner({ tone, message }: { tone: Tone; message: string }) {
  const s = TONE_STYLES[tone];
  return (
    <View style={[styles.container, { backgroundColor: s.bg, borderColor: s.border }]} accessibilityRole="alert">
      <Text style={[styles.icon, { color: s.text }]}>{s.icon}</Text>
      <Text style={[styles.text, { color: s.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius,
    padding: spacing.md,
  },
  icon: {
    fontSize: 16,
    fontWeight: '700',
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
});
