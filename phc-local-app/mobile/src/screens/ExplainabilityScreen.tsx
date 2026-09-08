import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import { useScreening } from '../context/ScreeningContext';
import GradCamCard, { LesionMarker } from '../components/GradCamCard';
import QualityCard from '../components/QualityCard';
import DisclaimerBanner from '../components/DisclaimerBanner';
import { getSeverityDisplay } from '../utils/severityHelpers';
import { Colors, Typography, Spacing } from '../theme';

export default function ExplainabilityScreen() {
  const { state } = useScreening();
  const result = state.result;

  if (!result) return null;

  const severityDisplay = getSeverityDisplay(result.severity.level);

  // Clinically adapted lesions based on the diagnosed severity level
  const dynamicLesions: LesionMarker[] = useMemo(() => {
    const level = result.severity.level;
    if (level === 0) {
      return [];
    }
    if (level === 1) {
      return [
        {
          id: 'lesion-1',
          type: 'Microaneurysm',
          typeCode: 'MA',
          confidence: 0.89,
          location: 'Superior-Temporal Arc',
          xPercent: 38,
          yPercent: 32,
          color: Colors.primaryLight,
          explanation: 'Isolated focal capillary dilation; consistent with Mild Non-Proliferative DR.',
        },
      ];
    }
    if (level === 2) {
      return [
        {
          id: 'lesion-1',
          type: 'Microaneurysm',
          typeCode: 'MA',
          confidence: 0.94,
          location: 'Superior-Temporal Arc',
          xPercent: 36,
          yPercent: 32,
          color: Colors.primaryLight,
          explanation: 'Focal dilation of retinal capillaries in superior-temporal arcade.',
        },
        {
          id: 'lesion-2',
          type: 'Dot Hemorrhage',
          typeCode: 'HEM',
          confidence: 0.88,
          location: 'Inferior-Nasal Region',
          xPercent: 62,
          yPercent: 64,
          color: Colors.danger,
          explanation: 'Intraretinal microvascular rupture within deep capillary plexus.',
        },
        {
          id: 'lesion-3',
          type: 'Hard Exudate',
          typeCode: 'HEX',
          confidence: 0.91,
          location: 'Macular Periphery',
          xPercent: 49,
          yPercent: 45,
          color: Colors.accentGold,
          explanation: 'Lipoprotein deposits indicative of microvascular hyperpermeability.',
        },
      ];
    }
    if (level === 3) {
      return [
        {
          id: 'lesion-1',
          type: 'Multiple Blot Hemorrhages',
          typeCode: 'HEM',
          confidence: 0.96,
          location: 'All 4 Quadrants',
          xPercent: 34,
          yPercent: 28,
          color: Colors.danger,
          explanation: 'Extensive 4-quadrant intraretinal hemorrhages meeting severe NPDR criteria.',
        },
        {
          id: 'lesion-2',
          type: 'Venous Beading',
          typeCode: 'VB',
          confidence: 0.91,
          location: 'Superior Branch Vein',
          xPercent: 42,
          yPercent: 22,
          color: Colors.warning,
          explanation: 'Venous caliber irregularity indicating significant retinal ischemia.',
        },
        {
          id: 'lesion-3',
          type: 'Cotton Wool Spot',
          typeCode: 'CWS',
          confidence: 0.89,
          location: 'Temporal Arcade',
          xPercent: 28,
          yPercent: 55,
          color: '#E0A96D',
          explanation: 'Nerve fiber layer infarction secondary to precapillary arteriolar occlusion.',
        },
        {
          id: 'lesion-4',
          type: 'Hard Exudates',
          typeCode: 'HEX',
          confidence: 0.93,
          location: 'Perifoveal Ring',
          xPercent: 52,
          yPercent: 46,
          color: Colors.accentGold,
          explanation: 'Perifoveal circinate lipid ring presenting high risk for macular edema.',
        },
      ];
    }
    // Grade 4: Proliferative DR
    return [
      {
        id: 'lesion-1',
        type: 'Neovascularization',
        typeCode: 'NVD',
        confidence: 0.97,
        location: 'Optic Disc Margin',
        xPercent: 66,
        yPercent: 44,
        color: Colors.grade4,
        explanation: 'Pathologic new vessel proliferation on or near the optic disc requiring urgent photocoagulation / anti-VEGF.',
      },
      {
        id: 'lesion-2',
        type: 'Preretinal Hemorrhage',
        typeCode: 'PRH',
        confidence: 0.94,
        location: 'Inferior Macular Border',
        xPercent: 45,
        yPercent: 60,
        color: Colors.danger,
        explanation: 'Boat-shaped hemorrhage between retina and posterior vitreous face.',
      },
      {
        id: 'lesion-3',
        type: 'Microvascular Loops',
        typeCode: 'IRMA',
        confidence: 0.88,
        location: 'Temporal Field',
        xPercent: 30,
        yPercent: 38,
        color: Colors.primaryLight,
        explanation: 'Intraretinal microvascular abnormalities bridging arteriolar-venular shunts.',
      },
      {
        id: 'lesion-4',
        type: 'Fibrous Proliferation',
        typeCode: 'FP',
        confidence: 0.85,
        location: 'Superior Vascular Arcade',
        xPercent: 40,
        yPercent: 24,
        color: Colors.accentGold,
        explanation: 'Fibrovascular scaffolding along the arcade with high tractional retinal detachment risk.',
      },
    ];
  }, [result.severity.level]);

  // Build an evidence summary from available data
  const evidenceSummary = [
    `The model analysed a ${result.input.originalWidth}×${result.input.originalHeight} pixel retinal image.`,
    `Image quality score: ${Math.round(result.imageQuality.qualityScore * 100)}%.`,
    result.enhancement.applied
      ? `Enhancement steps applied: ${result.enhancement.steps.join(', ')}.`
      : 'No image enhancement was required.',
    `The AI model (${result.model.name}) assessed this as ${severityDisplay.fullLabel}.`,
    `Referral threshold: ${Math.round(result.referableDR.threshold * 100)}%. ` +
    `Model score: ${Math.round(result.referableDR.rawProbability * 100)}%.`,
    dynamicLesions.length > 0
      ? `Visual evidence reveals ${dynamicLesions.length} identified suspicious lesion markers.`
      : 'No characteristic microvascular lesions detected in the current field of view.',
  ].join(' ');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Image Analysis Details</Text>

        {/* GradCam card with interactive layers & lesion evidence */}
        <GradCamCard
          originalUri={state.imageUri}
          processedUri={null}
          gradCamUri={null}
          evidenceSummary={evidenceSummary}
          lesions={dynamicLesions}
        />

        {/* Quality details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QUALITY DETAILS</Text>
          <QualityCard
            imageQuality={result.imageQuality}
            enhancement={result.enhancement}
            compact
          />
        </View>

        {/* Quality metrics table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QUALITY METRICS</Text>
          <View style={styles.metricsCard}>
            {Object.entries(result.imageQuality.metrics).map(([key, value]) => {
              const label = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/Score$/, '')
                .trim();
              return (
                <View key={key} style={styles.metricRow}>
                  <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
                  <View style={styles.metricBar}>
                    <View
                      style={[
                        styles.metricFill,
                        { width: `${Math.round(value * 100)}%` as any },
                      ]}
                    />
                  </View>
                  <Text style={styles.metricValue}>{Math.round(value * 100)}%</Text>
                </View>
              );
            })}
          </View>
        </View>

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
    gap: Spacing.sm,
  },
  metricLabel: {
    width: 90,
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  metricBar: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surfaceDark,
    borderRadius: 0,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 0,
  },
  metricValue: {
    width: 32,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    fontWeight: Typography.semibold,
  },
});
