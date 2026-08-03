import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.container}>
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
  },
  label: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});
