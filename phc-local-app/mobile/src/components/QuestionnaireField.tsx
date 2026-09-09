import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, TouchTarget } from '../theme';

interface ButtonOption {
  value: string;
  label: string;
}

interface ButtonGroupFieldProps {
  label: string;
  options: ButtonOption[];
  value: string | null;
  onSelect: (value: string) => void;
}

export function ButtonGroupField({ label, options, value, onSelect }: ButtonGroupFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.optionGrid}>
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.optionButton,
                isSelected && styles.optionButtonSelected,
              ]}
              onPress={() => onSelect(opt.value)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[
                styles.optionText,
                isSelected && styles.optionTextSelected,
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionButton: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    backgroundColor: Colors.surface,
    minHeight: TouchTarget.minHeight,
    justifyContent: 'center',
    minWidth: 80,
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
  },
  optionText: {
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    color: Colors.textSecondary,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.bold,
  },
});
