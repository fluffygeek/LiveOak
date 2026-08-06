import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, minTouchTarget, radius, spacing } from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  /** Inline validation message. Also switches the border to danger so the problem is visible without reading text. */
  error?: string | null;
  required?: boolean;
}

export function TextField({ label, style, accessibilityLabel, error, required, ...props }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, !!error && styles.inputError, style]}
        accessibilityLabel={accessibilityLabel ?? label}
        {...props}
      />
      {error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  required: {
    color: colors.danger,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: minTouchTarget + 4,
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
});
