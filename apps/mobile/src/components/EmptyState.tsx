import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function EmptyState({ label, icon = '📋' }: { label: string; icon?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: 28,
  },
  label: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 15,
  },
});
