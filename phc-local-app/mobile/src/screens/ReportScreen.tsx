import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import { useScreening } from '../context/ScreeningContext';
import DisclaimerBanner from '../components/DisclaimerBanner';
import StatusBadge from '../components/StatusBadge';
import HumanInTheLoopStatus from '../components/HumanInTheLoopStatus';
import { getSeverityDisplay, getPriorityColour } from '../utils/severityHelpers';
import { formatDateTime } from '../utils/dateHelpers';
import { Colors, Typography, Spacing, Shadows } from '../theme';

export default function ReportScreen() {
  const { state } = useScreening();
  const result = state.result;
  const patient = state.patient;

  if (!result || !patient) return null;

  // Derive values from CentralCaseDetail
  const drGrade     = result.drGradeCnn ?? result.drGradeRuleEngine ?? 0;
  const isReferable = drGrade >= 2;   // grade 2+ = referable
  const severity    = getSeverityDisplay(drGrade);

  const priority = isReferable
    ? (drGrade >= 4 ? 'EMERGENCY' : drGrade >= 3 ? 'URGENT' : 'ROUTINE')
    : 'ROUTINE';
  const priorityColour = getPriorityColour(priority);

  const actionText = isReferable
    ? severity.workerAdvice
    : 'Advise the patient to continue annual screening and maintain good blood sugar control.';

  const referralVariant = isReferable ? 'danger' : 'success';

  const confidencePct = result.confidenceScore != null
    ? `${Math.round(result.confidenceScore * 100)}%`
    : 'N/A';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Report header */}
        <View style={[styles.reportHeader, Shadows.sm]}>
          <View style={styles.headerAccent} />
          <View style={styles.headerContent}>
            <Text style={styles.reportTitle}>RETINASAARTHI SCREENING REPORT</Text>
            <Text style={styles.reportTimestamp}>{formatDateTime(result.caseId ? new Date().toISOString() : '')}</Text>
          </View>
        </View>

        {/* Human-in-the-Loop Status */}
        <HumanInTheLoopStatus
          currentStage="awaiting_doctor"
          isReferable={isReferable}
        />

        {/* Patient section */}
        <View style={styles.reportSection}>
          <Text style={styles.sectionHeader}>PATIENT INFORMATION</Text>
          <View style={styles.infoGrid}>
            <Row label="NAME"       value={patient.name} />
            <Row label="AGE"        value={`${patient.age} years`} />
            {patient.referenceId && <Row label="REFERENCE ID" value={patient.referenceId} />}
          </View>
        </View>

        {/* Case info */}
        <View style={styles.reportSection}>
          <Text style={styles.sectionHeader}>CASE INFORMATION</Text>
          <View style={styles.infoGrid}>
            <Row label="CASE ID"    value={result.caseId} />
            {result.eyeLaterality && <Row label="EYE" value={result.eyeLaterality.toUpperCase()} />}
            {result.status && <Row label="STATUS" value={result.status.replace('_', ' ').toUpperCase()} />}
          </View>
        </View>

        {/* Severity section */}
        <View style={styles.reportSection}>
          <Text style={styles.sectionHeader}>DR SEVERITY ASSESSMENT</Text>
          <View style={[styles.severityBlock, { backgroundColor: severity.backgroundColour }]}>
            <Text style={[styles.severityGrade, { color: severity.colour }]}>
              Grade {drGrade} — {severity.shortLabel.toUpperCase()}
            </Text>
            <Text style={[styles.severityFullLabel, { color: severity.colour }]}>
              {severity.fullLabel}
            </Text>
          </View>
          <Text style={styles.explanationText}>{severity.whatThisMeans}</Text>
          {result.confidenceScore != null && (
            <Text style={styles.confidenceNote}>Model confidence: {confidencePct}</Text>
          )}
          {result.branchAgreement != null && (
            <Text style={styles.confidenceNote}>
              CNN & rule-engine: {result.branchAgreement ? '✓ agree' : '⚠ disagree'}
            </Text>
          )}
        </View>

        {/* Referral section */}
        <View style={styles.reportSection}>
          <Text style={styles.sectionHeader}>REFERRAL RECOMMENDATION</Text>
          <View style={styles.referralRow}>
            <Text style={styles.referralLabel}>Referral required:</Text>
            <StatusBadge
              label={isReferable ? 'YES' : 'NO'}
              variant={referralVariant}
              size="lg"
            />
          </View>
          <View style={[styles.priorityTag, { borderLeftColor: priorityColour }]}>
            <Text style={[styles.priorityTagText, { color: priorityColour }]}>
              {priority}
            </Text>
            <Text style={styles.actionText}>{actionText}</Text>
          </View>
        </View>

        {/* Explanation */}
        <View style={styles.reportSection}>
          <Text style={styles.sectionHeader}>EXPLANATION FOR HEALTH WORKER</Text>
          <Text style={styles.explanationText}>{severity.workerAdvice}</Text>
        </View>

        {/* Disclaimer */}
        <View style={styles.reportSection}>
          <DisclaimerBanner />
        </View>

        {/* Footer */}
        <View style={styles.footerLine} />
        <Text style={styles.footer}>
          Generated by RetinaSaarthi AI Screening Tool · Case {result.caseId}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  label: {
    width: 110,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  value: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    fontWeight: Typography.semibold,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },

  reportHeader: {
    backgroundColor: Colors.primary,
    borderRadius: 0,
    marginBottom: Spacing.base,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  headerAccent: {
    width: 4,
    backgroundColor: Colors.accentGold,
  },
  headerContent: {
    flex: 1,
    padding: Spacing.base,
  },
  reportTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
    letterSpacing: Typography.trackWide,
  },
  reportTimestamp: {
    fontSize: Typography.sm,
    color: Colors.textInverse,
    opacity: 0.7,
    marginTop: 2,
  },

  reportSection: {
    backgroundColor: Colors.surface,
    borderRadius: 0,
    padding: Spacing.base,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    marginBottom: Spacing.md,
  },

  infoGrid: { gap: 0 },

  severityBlock: {
    borderRadius: 0,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  severityGrade: {
    fontSize: Typography.lg,
    fontWeight: Typography.heavy,
    letterSpacing: Typography.trackWide,
  },
  severityFullLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    marginTop: 2,
  },

  explanationText: {
    fontSize: Typography.base,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  confidenceNote: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    fontWeight: Typography.medium,
  },

  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  referralLabel: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },

  priorityTag: {
    borderLeftWidth: 4,
    paddingLeft: Spacing.md,
    gap: Spacing.xs,
  },
  priorityTagText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  actionText: {
    fontSize: Typography.base,
    color: Colors.textPrimary,
    lineHeight: 22,
  },

  footerLine: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  footer: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingTop: Spacing.sm,
  },
});
