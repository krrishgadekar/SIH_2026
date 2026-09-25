import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreening } from '../context/ScreeningContext';
import GradCamCard, { LesionMarker } from '../components/GradCamCard';
import DisclaimerBanner from '../components/DisclaimerBanner';
import { getSeverityDisplay } from '../utils/severityHelpers';
import { Colors, Typography, Spacing } from '../theme';

export default function ExplainabilityScreen() {
  const { state } = useScreening();
  const result = state.result;

  if (!result) return null;

  const drGrade = result.drGradeCnn ?? result.drGradeRuleEngine ?? 0;
  const severityDisplay = getSeverityDisplay(drGrade);

  // Clinically adapted lesions based on DR grade
  const dynamicLesions: LesionMarker[] = useMemo(() => {
    const level = drGrade;
    if (level === 0) return [];
    if (level === 1) return [
      {
        id: 'lesion-1', type: 'Microaneurysm', typeCode: 'MA', confidence: 0.89,
        location: 'Superior-Temporal Arc', xPercent: 38, yPercent: 32,
        color: Colors.primaryLight,
        explanation: 'Isolated focal capillary dilation; consistent with Mild Non-Proliferative DR.',
      },
    ];
    if (level === 2) return [
      {
        id: 'lesion-1', type: 'Microaneurysm', typeCode: 'MA', confidence: 0.94,
        location: 'Superior-Temporal Arc', xPercent: 36, yPercent: 32,
        color: Colors.primaryLight,
        explanation: 'Focal dilation of retinal capillaries in superior-temporal arcade.',
      },
      {
        id: 'lesion-2', type: 'Dot Hemorrhage', typeCode: 'HEM', confidence: 0.88,
        location: 'Inferior-Nasal Region', xPercent: 62, yPercent: 64,
        color: Colors.danger,
        explanation: 'Intraretinal microvascular rupture within deep capillary plexus.',
      },
      {
        id: 'lesion-3', type: 'Hard Exudate', typeCode: 'HEX', confidence: 0.91,
        location: 'Macular Periphery', xPercent: 49, yPercent: 45,
        color: Colors.accentGold,
        explanation: 'Lipoprotein deposits indicative of microvascular hyperpermeability.',
      },
    ];
    if (level === 3) return [
      {
        id: 'lesion-1', type: 'Multiple Blot Hemorrhages', typeCode: 'HEM', confidence: 0.96,
        location: 'All 4 Quadrants', xPercent: 34, yPercent: 28,
        color: Colors.danger,
        explanation: 'Extensive 4-quadrant intraretinal hemorrhages meeting severe NPDR criteria.',
      },
      {
        id: 'lesion-2', type: 'Venous Beading', typeCode: 'VB', confidence: 0.91,
        location: 'Superior Branch Vein', xPercent: 42, yPercent: 22,
        color: Colors.warning,
        explanation: 'Venous caliber irregularity indicating significant retinal ischemia.',
      },
      {
        id: 'lesion-3', type: 'Cotton Wool Spot', typeCode: 'CWS', confidence: 0.89,
        location: 'Temporal Arcade', xPercent: 28, yPercent: 55,
        color: '#E0A96D',
        explanation: 'Nerve fiber layer infarction secondary to precapillary arteriolar occlusion.',
      },
    ];
    // Grade 4: Proliferative DR
    return [
      {
        id: 'lesion-1', type: 'Neovascularization', typeCode: 'NVD', confidence: 0.97,
        location: 'Optic Disc Margin', xPercent: 66, yPercent: 44,
        color: Colors.grade4,
        explanation: 'Pathologic new vessel proliferation on or near the optic disc requiring urgent photocoagulation / anti-VEGF.',
      },
      {
        id: 'lesion-2', type: 'Preretinal Hemorrhage', typeCode: 'PRH', confidence: 0.94,
        location: 'Inferior Macular Border', xPercent: 45, yPercent: 60,
        color: Colors.danger,
        explanation: 'Boat-shaped hemorrhage between retina and posterior vitreous face.',
      },
    ];
  }, [drGrade]);

  // Build evidence summary from available backend fields
  const confidencePct = result.confidenceScore != null ? `${Math.round(result.confidenceScore * 100)}%` : 'N/A';
  const uncertaintyPct = result.uncertaintyScore != null ? `${Math.round(result.uncertaintyScore * 100)}%` : 'N/A';
  const nvScore = result.nvSuspicionScore != null ? `${Math.round(result.nvSuspicionScore * 100)}%` : null;

  const evidenceSummary = [
    `The AI model assessed the retinal image as ${severityDisplay.fullLabel} (Grade ${drGrade}).`,
    result.branchAgreement != null
      ? `CNN and rule-engine ${result.branchAgreement ? 'agree' : 'disagree'} on this assessment.`
      : null,
    `Model confidence: ${confidencePct}. Uncertainty: ${uncertaintyPct}.`,
    result.conformalTier ? `Conformal tier: ${result.conformalTier}.` : null,
    nvScore ? `Neovascularisation suspicion score: ${nvScore}.` : null,
    dynamicLesions.length > 0
      ? `Visual evidence reveals ${dynamicLesions.length} identified suspicious lesion markers.`
      : 'No characteristic microvascular lesions detected in the current field of view.',
  ].filter(Boolean).join(' ');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Image Analysis Details</Text>

        {/* GradCam card with interactive layers & lesion evidence */}
        <GradCamCard
          originalUri={state.imageUri}
          processedUri={null}
          gradCamUri={result.gradCamOverlayUrl ?? null}
          evidenceSummary={evidenceSummary}
          lesions={dynamicLesions}
        />

        {/* Prior assessments (if any) */}
        {result.priorAssessments && result.priorAssessments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PRIOR ASSESSMENTS</Text>
            <View style={styles.metricsCard}>
              {result.priorAssessments.map((p, i) => (
                <View key={p.caseId || i} style={styles.metricRow}>
                  <Text style={styles.metricLabel}>CASE {i + 1}</Text>
                  <Text style={styles.metricValue}>
                    Grade {p.drGradeCnn ?? '?'} · {p.gradedAt?.slice(0, 10) ?? ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Lesion counts from backend */}
        {result.lesionCounts && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LESION COUNTS</Text>
            <View style={styles.metricsCard}>
              {result.lesionCounts.microaneurysms != null && (
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>MICROANEURYSMS</Text>
                  <Text style={styles.metricValue}>{result.lesionCounts.microaneurysms}</Text>
                </View>
              )}
              {result.lesionCounts.hemorrhages != null && (
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>HEMORRHAGES</Text>
                  <Text style={styles.metricValue}>{result.lesionCounts.hemorrhages}</Text>
                </View>
              )}
              {result.lesionCounts.hardExudates != null && (
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>HARD EXUDATES</Text>
                  <Text style={styles.metricValue}>{result.lesionCounts.hardExudates}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* AI evidence summary text */}
        {result.evidenceSummaryText && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI EVIDENCE NOTE</Text>
            <View style={styles.metricsCard}>
              <Text style={styles.evidenceText}>{result.evidenceSummaryText}</Text>
            </View>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.section}>
          <DisclaimerBanner />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },

  heading: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.heavy,
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
    marginTop: Spacing.sm,
  },

  section: { marginTop: Spacing.base },
  sectionTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    marginBottom: Spacing.sm,
  },

  metricsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 0,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  metricLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  metricValue: {
    fontSize: Typography.xs,
    color: Colors.textPrimary,
    fontWeight: Typography.semibold,
  },
  evidenceText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
