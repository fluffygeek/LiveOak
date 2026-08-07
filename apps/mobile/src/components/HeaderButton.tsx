import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, minTouchTarget, spacing } from '../theme';

/**
 * Text-only header action (e.g. Sign Out, Discard). Always tinted — plain dark text in
 * a header reads as a static label, not a button, to someone scanning quickly. `tone`
 * lets destructive actions (Discard) read as such without needing a confirm dialog to
 * find out.
 */
export function HeaderButton({
  title,
  onPress,
  tone = 'default',
  loading,
}: {
  title: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  loading?: boolean;
}) {
  const color = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityState={{ busy: loading }}
      style={styles.button}
    >
      {loading ? <ActivityIndicator color={color} size="small" /> : <Text style={[styles.label, { color }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
});
