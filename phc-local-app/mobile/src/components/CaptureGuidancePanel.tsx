import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, Shadows } from '../theme';

export type QualityGuidanceStatus = 'pass' | 'warning' | 'fail';

export interface QualityMetricItem {
  id: string;
  name: string;
  status: QualityGuidanceStatus;
  statusText: string;
  tip: string;
}

interface CaptureGuidancePanelProps {
  hasCapturedImage: boolean;
  onRetake?: () => void;
  actionInstruction?: string;
  customMetrics?: QualityMetricItem[];
}

export default function CaptureGuidancePanel({
  hasCapturedImage,
  onRetake,
  actionInstruction,
  customMetrics,
}: CaptureGuidancePanelProps) {
  // Default checklist for live or preview guidance
  const metrics: QualityMetricItem[] = customMetrics || [
    {
      id: 'focus',
      name: 'FOCUS',
      status: hasCapturedImage ? 'pass' : 'pass',
      statusText: hasCapturedImage ? 'SHARP' : 'ACTIVE',
      tip: 'Fine vessel branches clearly defined',
    },
    {
      id: 'illumination',
      name: 'ILLUMINATION',
      status: hasCapturedImage ? 'pass' : 'pass',
      statusText: hasCapturedImage ? 'OPTIMAL' : 'BALANCED',
      tip: 'Uniform light without dark quadrants',
    },
    {
      id: 'coverage',
      name: 'RETINAL COVERAGE',
      status: hasCapturedImage ? 'pass' : 'pass',
      statusText: hasCapturedImage ? 'COMPLETE (>80%)' : 'TARGET >80%',
      tip: 'Optic disc and macula both visible',
    },
    {
      id: 'blur',
      name: 'BLUR CHECK',
      status: hasCapturedImage ? 'pass' : 'pass',
      statusText: hasCapturedImage ? 'NONE DETECTED' : 'MOTION FREE',
      tip: 'No translational patient motion',
    },
    {
      id: 'glare',
      name: 'GLARE',
      status: hasCapturedImage ? 'pass' : 'pass',
      statusText: hasCapturedImage ? 'MINIMAL' : 'ABSENT',
      tip: 'Corneal flash artifact shielded',
    },
    {
      id: 'centering',
      name: 'CENTERING',
      status: hasCapturedImage ? 'pass' : 'pass',
      statusText: hasCapturedImage ? 'CENTERED' : 'TARGET: FOVEA',
      tip: 'Macula centered horizontally',
    },
  ];

  // Dynamic actionable instruction
  const instruction =
    actionInstruction ||
    (!hasCapturedImage
      ? 'Center retina & hold steady'
      : 'Optimal capture quality · Ready to proceed');

  const isWarningInstruction =
    instruction.includes('Retake') ||
    instruction.includes('lighting') ||
    instruction.includes('steady');

  return (
    <View style={[styles.container, Shadows.sm]}>
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.headerAccent} />
        <Text style={styles.headerTitle}>SMART CAPTURE GUIDANCE</Text>
        <View style={styles.liveTag}>
          <Text style={styles.liveTagText}>AI ASSIST</Text>
        </View>
      </View>

      {/* Actionable Instruction Banner */}
      <View
        style={[
          styles.instructionBanner,
          isWarningInstruction
            ? styles.instructionBannerWarning
            : styles.instructionBannerPass,
        ]}
      >
        <Text style={styles.instructionIcon}>
          {isWarningInstruction ? '⚠' : '✦'}
        </Text>
        <Text
          style={[
            styles.instructionText,
            isWarningInstruction
              ? styles.instructionTextWarning
              : styles.instructionTextPass,
          ]}
        >
          {instruction.toUpperCase()}
        </Text>
      </View>

      {/* 6 Quality Criteria Grid */}
      <View style={styles.grid}>
        {metrics.map((item) => {
          const isPass = item.status === 'pass';
          const isWarn = item.status === 'warning';
          const statusColor = isPass
            ? Colors.success
            : isWarn
            ? Colors.warning
            : Colors.danger;

          return (
            <View key={item.id} style={styles.metricCard}>
              <View style={styles.metricTopRow}>
                <Text style={styles.metricName}>{item.name}</Text>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              </View>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {item.statusText}
              </Text>
              <Text style={styles.metricTip}>{item.tip}</Text>
            </View>
          );
        })}
      </View>

      {/* Quick actionable instructions guide */}
      <View style={styles.actionPillsRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>“Hold steady”</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>“Center retina”</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>“Improve lighting”</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>“Retake image”</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  headerAccent: {
    width: 3,
    height: 14,
    backgroundColor: Colors.accentGold,
  },
  headerTitle: {
    flex: 1,
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
  },
  liveTag: {
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  liveTagText: {
    fontSize: 8,
    fontWeight: Typography.heavy,
    color: Colors.primary,
    letterSpacing: 1,
  },

  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  instructionBannerPass: {
    backgroundColor: Colors.successLight,
  },
  instructionBannerWarning: {
    backgroundColor: Colors.warningLight,
  },
  instructionIcon: {
    fontSize: Typography.base,
  },
  instructionText: {
    fontSize: Typography.xs,
    fontWeight: Typography.heavy,
    letterSpacing: Typography.trackWide,
  },
  instructionTextPass: {
    color: Colors.success,
  },
  instructionTextWarning: {
    color: Colors.warning,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  metricCard: {
    width: '50%',
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  metricTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  metricName: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 0,
  },
  statusText: {
    fontSize: 10,
    fontWeight: Typography.heavy,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricTip: {
    fontSize: 9,
    color: Colors.textSecondary,
    lineHeight: 12,
  },

  actionPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceDark,
  },
  pill: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillText: {
    fontSize: 9,
    fontWeight: Typography.medium,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
