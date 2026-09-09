import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Severity, ReferableDR, Confidence, Recommendation } from '../types/screening';
import {
  getSeverityDisplay,
  getPriorityColour,
  getPriorityBackground,
} from '../utils/severityHelpers';
import { Colors, Typography, Spacing, Shadows } from '../theme';

interface SeverityCardProps {
  severity: Severity;
  referableDR: ReferableDR;
  confidence?: Confidence;
  recommendation: Recommendation;
}

export default function SeverityCard({
  severity,
  referableDR,
  recommendation,
}: SeverityCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const display = getSeverityDisplay(severity.level);
  const priorityColour = getPriorityColour(recommendation.priority);
  const priorityBg = getPriorityBackground(recommendation.priority);

  return (
    <View style={[styles.card, Shadows.md]}>
      {/* Grade badge — large editorial block */}
      <View style={[styles.gradeBadge, { backgroundColor: display.backgroundColour }]}>
        <Text style={[styles.gradeTag, { color: display.colour }]}>GRADE</Text>
        <Text style={[styles.gradeNumber, { color: display.colour }]}>
          {severity.level}
        </Text>
        <Text style={[styles.gradeLabel, { color: display.colour }]}>
          {display.shortLabel.toUpperCase()}
        </Text>
      </View>

      {/* Diagnosis banner */}
      <View style={styles.fullLabelRow}>
        <View style={[styles.fullLabelAccent, { backgroundColor: display.colour }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.fullLabel}>{display.fullLabel}</Text>
          <Text style={styles.clinicalCodeText}>
            ICD-10 CLASSIFICATION: {severity.code?.toUpperCase() || `GRADE_${severity.level}`}
          </Text>
        </View>
      </View>

      {/* Referable & Referral Priority Row */}
      <View style={styles.breakdownRow}>
        <View
          style={[
            styles.breakdownCol,
            { backgroundColor: referableDR.isReferable ? Colors.dangerLight : Colors.successLight },
          ]}
        >
          <Text
            style={[
              styles.dataLabel,
              { color: referableDR.isReferable ? Colors.danger : Colors.success },
            ]}
          >
            REFERABLE DR
          </Text>
          <Text
            style={[
              styles.dataValue,
              { color: referableDR.isReferable ? Colors.danger : Colors.success },
            ]}
          >
            {referableDR.isReferable ? 'YES (POSITIVE)' : 'NO (NEGATIVE)'}
          </Text>
          <Text style={styles.thresholdSubtext}>
            Prob: {Math.round((referableDR.probability ?? 0) * 100)}% (Thresh: {Math.round((referableDR.threshold ?? 0.5) * 100)}%)
          </Text>
        </View>

        <View style={[styles.breakdownCol, { backgroundColor: priorityBg }]}>
          <Text style={[styles.dataLabel, { color: priorityColour }]}>
            REFERRAL PRIORITY
          </Text>
          <Text style={[styles.dataValue, { color: priorityColour }]}>
            {recommendation.priority.toUpperCase()}
          </Text>
          <Text style={[styles.thresholdSubtext, { color: priorityColour }]}>
            {recommendation.priority === 'URGENT' || recommendation.priority === 'EMERGENCY'
              ? 'Within 2-4 Weeks'
              : 'Routine Annual Review'}
          </Text>
        </View>
      </View>

      {/* What this means — expandable */}
      <TouchableOpacity
        style={styles.expandRow}
        onPress={() => setShowExplanation(!showExplanation)}
        accessibilityRole="button"
        accessibilityLabel="Toggle explanation"
      >
        <Text style={styles.expandLabel}>WHAT DOES THIS MEAN?</Text>
        <Text style={styles.expandIcon}>{showExplanation ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {showExplanation && (
        <View style={styles.explanationBox}>
          <Text style={styles.explanationText}>{display.whatThisMeans}</Text>
          <View style={styles.adviceDivider} />
          <Text style={styles.workerAdvice}>{display.workerAdvice}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gradeBadge: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  gradeTag: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackUltraWide,
    marginBottom: Spacing.xs,
  },
  gradeNumber: {
    fontSize: Typography['5xl'],
    fontWeight: Typography.heavy,
    lineHeight: 48,
  },
  gradeLabel: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    marginTop: Spacing.xs,
    letterSpacing: Typography.trackWide,
  },
  fullLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  fullLabelAccent: {
    width: 3,
    height: 28,
  },
  fullLabel: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    fontWeight: Typography.bold,
  },
  clinicalCodeText: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
    marginTop: 2,
  },

  breakdownRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  breakdownCol: {
    flex: 1,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
  },
  dataLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
    marginBottom: 2,
  },
  dataValue: {
    fontSize: Typography.md,
    fontWeight: Typography.heavy,
    letterSpacing: Typography.trackWide,
  },
  thresholdSubtext: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 3,
    fontWeight: Typography.medium,
  },

  expandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  expandLabel: {
    fontSize: Typography.xs,
    color: Colors.primary,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  expandIcon: {
    fontSize: Typography.sm,
    color: Colors.primary,
  },
  explanationBox: {
    padding: Spacing.base,
    backgroundColor: Colors.surfaceDark,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  explanationText: {
    fontSize: Typography.base,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  adviceDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  workerAdvice: {
    fontSize: Typography.base,
    color: Colors.primary,
    fontWeight: Typography.semibold,
    lineHeight: 22,
  },
});
