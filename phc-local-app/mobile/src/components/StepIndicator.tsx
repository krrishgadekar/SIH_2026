import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

const STEP_LABELS = ['Register', 'Capture', 'Quality', 'Questions', 'Analyse'];

export default function StepIndicator({ currentStep, totalSteps = 5 }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <View key={i} style={styles.stepItem}>
            {/* Connector line (before step, except first) */}
            {i > 0 && (
              <View style={[
                styles.connector,
                (isCompleted || isActive) && styles.connectorActive,
              ]} />
            )}

            {/* Step marker — square, not circle */}
            <View style={[
              styles.marker,
              isCompleted && styles.markerCompleted,
              isActive && styles.markerActive,
            ]}>
              <Text style={[
                styles.markerText,
                isCompleted && styles.markerTextCompleted,
                isActive && styles.markerTextActive,
              ]}>
                {isCompleted ? '✓' : stepNum}
              </Text>
            </View>

            {/* Step label */}
            <Text style={[
              styles.label,
              isActive && styles.labelActive,
              isCompleted && styles.labelCompleted,
            ]} numberOfLines={1}>
              {STEP_LABELS[i] || `Step ${stepNum}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    top: 12,
    left: -20,
    right: 20,
    height: 1,
    backgroundColor: Colors.border,
    zIndex: -1,
  },
  connectorActive: {
    backgroundColor: Colors.accentGold,
  },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 0, // Square markers — brutalist
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  markerCompleted: {
    backgroundColor: Colors.accentGold,
    borderColor: Colors.accentGoldDark,
  },
  markerActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  markerText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
  },
  markerTextCompleted: {
    color: Colors.surfaceElevated,
  },
  markerTextActive: {
    color: Colors.textInverse,
  },
  label: {
    fontSize: 9,
    fontWeight: Typography.medium,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: Typography.trackWide,
    textAlign: 'center',
  },
  labelActive: {
    color: Colors.primary,
    fontWeight: Typography.bold,
  },
  labelCompleted: {
    color: Colors.accentGoldDark,
    fontWeight: Typography.semibold,
  },
});
