import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, minTouchTarget, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'default' | 'compact';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  /** Helper text shown under a disabled button explaining why it can't be pressed yet — avoids a mystery-disabled CTA. */
  disabledReason?: string;
}

/** Pressable-based button styled to match the design tokens — RN's built-in `<Button>` can't be visually customized. */
export function Button({ title, onPress, variant = 'primary', size = 'default', disabled, loading, disabledReason }: ButtonProps) {
  const isDisabled = disabled || loading;
  const labelColor = variant === 'secondary' || variant === 'ghost' ? colors.text : colors.surface;
  return (
    <View>
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        hitSlop={size === 'compact' ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={({ pressed }) => [
          styles.base,
          size === 'compact' && styles.baseCompact,
          variantStyles[variant],
          isDisabled && styles.disabled,
          pressed && !isDisabled && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <Text style={[styles.label, size === 'compact' && styles.labelCompact, variant !== 'primary' && variant !== 'danger' && styles.labelSecondary]}>
            {title}
          </Text>
        )}
      </Pressable>
      {isDisabled && disabledReason ? <Text style={styles.reason}>{disabledReason}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: minTouchTarget + 4,
  },
  baseCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: colors.surface,
    fontWeight: '600',
    fontSize: 16,
  },
  labelCompact: {
    fontSize: 14,
  },
  labelSecondary: {
    color: colors.text,
  },
  reason: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
});
