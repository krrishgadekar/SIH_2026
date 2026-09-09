import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

interface StatusBadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
}

const variantColors: Record<string, { text: string; bg: string; border: string }> = {
  success: { text: Colors.success, bg: Colors.successLight, border: Colors.success },
  warning: { text: Colors.warning, bg: Colors.warningLight, border: Colors.warning },
  danger:  { text: Colors.danger,  bg: Colors.dangerLight,  border: Colors.danger },
  info:    { text: Colors.info,    bg: Colors.infoLight,    border: Colors.info },
  neutral: { text: Colors.textMuted, bg: Colors.surfaceDark, border: Colors.border },
};

export default function StatusBadge({ label, variant = 'neutral', size = 'md' }: StatusBadgeProps) {
  const colors = variantColors[variant] ?? variantColors.neutral;
  const fontSize = size === 'sm' ? Typography.xs : size === 'lg' ? Typography.md : Typography.sm;
  const padH = size === 'sm' ? Spacing.sm : size === 'lg' ? Spacing.base : Spacing.md;
  const padV = size === 'sm' ? 2 : size === 'lg' ? Spacing.sm : Spacing.xs;

  return (
    <View style={[
      styles.badge,
      {
        backgroundColor: colors.bg,
        borderColor: colors.border,
        paddingHorizontal: padH,
        paddingVertical: padV,
      },
    ]}>
      <Text style={[
        styles.label,
        {
          color: colors.text,
          fontSize,
        },
      ]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 0,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
    textTransform: 'uppercase',
  },
});
