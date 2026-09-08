import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Shadows } from '../theme';

export type WorkflowStage =
  | 'ai_screening'
  | 'report_generated'
  | 'awaiting_doctor'
  | 'verified_overridden'
  | 'referral';

interface HumanInTheLoopStatusProps {
  currentStage?: WorkflowStage;
  isReferable?: boolean;
  isVerified?: boolean;
  isOverridden?: boolean;
  reviewerName?: string | null;
}

export default function HumanInTheLoopStatus({
  currentStage = 'awaiting_doctor',
  isReferable = false,
  isVerified = false,
  isOverridden = false,
  reviewerName = null,
}: HumanInTheLoopStatusProps) {
  const steps = [
    { key: 'ai_screening', label: 'AI SCREENING' },
    { key: 'report_generated', label: 'REPORT READY' },
    { key: 'awaiting_doctor', label: 'DOCTOR REVIEW' },
    { key: 'verified_overridden', label: isOverridden ? 'OVERRIDDEN' : isVerified ? 'VERIFIED' : 'DECISION' },
    { key: 'referral', label: isReferable ? 'URGENT REFERRAL' : 'MONITORING' },
  ];

  const getStepState = (stepKey: string, index: number) => {
    // Determine progress order:
    // 0: ai_screening (completed)
    // 1: report_generated (completed)
    // 2: awaiting_doctor (active/in progress)
    // 3: verified_overridden (upcoming or completed)
    // 4: referral (upcoming or terminal)
    if (index < 2) return 'completed';
    if (index === 2) {
      if (isVerified || isOverridden) return 'completed';
      return 'active';
    }
    if (index === 3) {
      if (isVerified || isOverridden) return 'active';
      return 'pending';
    }
    // index 4: referral
    if (isVerified || isOverridden) return 'active';
    return 'pending';
  };

  return (
    <View style={[styles.container, Shadows.sm]}>
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.headerAccent} />
        <Text style={styles.headerTitle}>HUMAN-IN-THE-LOOP CLINICAL WORKFLOW</Text>
        <View style={styles.tierTag}>
          <Text style={styles.tierText}>TELE-OPHTHALMOLOGY</Text>
        </View>
      </View>

      {/* Stepper Strip */}
      <View style={styles.stepperRow}>
        {steps.map((step, idx) => {
          const state = getStepState(step.key, idx);
          const isLast = idx === steps.length - 1;

          const isCompleted = state === 'completed';
          const isActive = state === 'active';

          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepNode}>
                <View
                  style={[
                    styles.nodeBox,
                    isCompleted && styles.nodeBoxCompleted,
                    isActive && styles.nodeBoxActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.nodeIndex,
                      isCompleted && styles.nodeIndexCompleted,
                      isActive && styles.nodeIndexActive,
                    ]}
                  >
                    {isCompleted ? '✓' : idx + 1}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.nodeLabel,
                    (isCompleted || isActive) && styles.nodeLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </View>

              {!isLast && (
                <View
                  style={[
                    styles.stepLine,
                    isCompleted && styles.stepLineCompleted,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Compact Status Notice */}
      <View style={styles.statusFooter}>
        <View style={styles.statusPulseDot} />
        <Text style={styles.statusFooterText}>
          {isVerified
            ? `Verified by Dr. ${reviewerName || 'Consultant Ophthalmologist'}`
            : isOverridden
            ? `Clinically overridden by Dr. ${reviewerName || 'Consultant Ophthalmologist'}`
            : 'AI Triaged · Queued for District Ophthalmologist Confirmation'}
        </Text>
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
    paddingHorizontal: Spacing.md,
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
    letterSpacing: Typography.trackWide,
  },
  tierTag: {
    backgroundColor: Colors.accentGoldLight,
    borderWidth: 1,
    borderColor: Colors.accentGoldDark,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  tierText: {
    fontSize: 8,
    fontWeight: Typography.heavy,
    color: Colors.accentGoldDark,
    letterSpacing: Typography.trackWide,
  },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    justifyContent: 'space-between',
  },
  stepNode: {
    alignItems: 'center',
    width: 60,
  },
  nodeBox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    marginBottom: 4,
  },
  nodeBoxCompleted: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  nodeBoxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  nodeIndex: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
  },
  nodeIndexCompleted: {
    color: Colors.textInverse,
  },
  nodeIndexActive: {
    color: Colors.textInverse,
  },
  nodeLabel: {
    fontSize: 8,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  nodeLabelActive: {
    color: Colors.textPrimary,
    fontWeight: Typography.bold,
  },

  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: 2,
    marginTop: -12,
  },
  stepLineCompleted: {
    backgroundColor: Colors.success,
    height: 2,
  },

  statusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  statusPulseDot: {
    width: 6,
    height: 6,
    backgroundColor: Colors.accentGold,
    borderRadius: 0,
  },
  statusFooterText: {
    fontSize: 10,
    fontWeight: Typography.medium,
    color: Colors.textSecondary,
    letterSpacing: Typography.trackNormal,
  },
});
