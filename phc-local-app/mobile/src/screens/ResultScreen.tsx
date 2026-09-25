import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import HumanInTheLoopStatus from '../components/HumanInTheLoopStatus';
import DisclaimerBanner from '../components/DisclaimerBanner';
import StatusBadge from '../components/StatusBadge';
import { getSeverityDisplay, getPriorityColour } from '../utils/severityHelpers';
import { Colors, Typography, Spacing, Shadows, TouchTarget, Animations } from '../theme';

export default function ResultScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { state, resetSession } = useScreening();
  const result = state.result;

  // Staggered fade-in
  const fadeAnims = useRef([0, 1, 2, 3, 4, 5].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    fadeAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: Animations.fadeInDuration,
        delay: i * 100,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  if (!result) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>No result available. Please run a new screening.</Text>
          <TouchableOpacity style={styles.restartButton} onPress={() => navigation.navigate('MainTabs')}>
            <Text style={styles.restartText}>GO HOME</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Derive display values from CentralCaseDetail
  const drGrade    = result.drGradeCnn ?? result.drGradeRuleEngine ?? 0;
  const isReferable = drGrade >= 2;
  const severity   = getSeverityDisplay(drGrade);

  const priority = isReferable
    ? (drGrade >= 4 ? 'EMERGENCY' : drGrade >= 3 ? 'URGENT' : 'ROUTINE')
    : 'ROUTINE';
  const priorityColour = getPriorityColour(priority);
  const referralVariant = isReferable ? 'danger' : 'success';

  const confidencePct = result.confidenceScore != null
    ? `${Math.round(result.confidenceScore * 100)}%`
    : null;

  const handleViewDetails = () => navigation.navigate(Routes.Explainability);
  const handleViewReport  = () => navigation.navigate(Routes.Report);
  const handleNewScreening = () => {
    resetSession();
    navigation.navigate('MainTabs');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnims[0] }]}>
          <Text style={styles.heading}>Screening Result</Text>
          <Text style={styles.timestamp}>Case: {result.caseId}</Text>
        </Animated.View>

        {/* Patient info strip */}
        {state.patient && (
          <Animated.View style={[styles.patientStrip, { opacity: fadeAnims[0] }]}>
            <View style={styles.patientAccent} />
            <View style={styles.patientContent}>
              <Text style={styles.patientName}>{state.patient.name}</Text>
              <Text style={styles.patientMeta}>AGE {state.patient.age}</Text>
              {state.patient.referenceId && (
                <Text style={styles.patientMeta}>{state.patient.referenceId}</Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* Human-in-the-Loop Status */}
        <Animated.View style={{ opacity: fadeAnims[1] }}>
          <HumanInTheLoopStatus
            currentStage="awaiting_doctor"
            isReferable={isReferable}
          />
        </Animated.View>

        {/* Severity Card */}
        <Animated.View style={[styles.severityCard, { opacity: fadeAnims[2] }]}>
          <View style={[styles.severityBlock, { backgroundColor: severity.backgroundColour }]}>
            <View style={styles.severityRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.severityGrade, { color: severity.colour }]}>
                  Grade {drGrade}
                </Text>
                <Text style={[styles.severityLabel, { color: severity.colour }]}>
                  {severity.fullLabel}
                </Text>
              </View>
              <StatusBadge
                label={isReferable ? 'REFER' : 'NO REFER'}
                variant={referralVariant}
                size="md"
              />
            </View>
            {confidencePct && (
              <Text style={[styles.confidenceText, { color: severity.colour }]}>
                Confidence: {confidencePct}
              </Text>
            )}
          </View>
          <Text style={styles.severityDescription}>{severity.whatThisMeans}</Text>
        </Animated.View>

        {/* Recommendation */}
        <Animated.View style={[styles.section, { opacity: fadeAnims[3] }]}>
          <View style={[styles.recommendationCard, { borderLeftColor: priorityColour }]}>
            <Text style={[styles.priorityLabel, { color: priorityColour }]}>{priority}</Text>
            <Text style={styles.recommendationText}>{severity.workerAdvice}</Text>
          </View>
        </Animated.View>

        {/* Disclaimer */}
        <Animated.View style={[styles.section, { opacity: fadeAnims[4] }]}>
          <DisclaimerBanner />
        </Animated.View>

        {/* Action buttons */}
        <Animated.View style={[styles.actions, { opacity: fadeAnims[5] }]}>
          <TouchableOpacity
            style={[styles.secondaryActionButton, Shadows.sm]}
            onPress={handleViewDetails}
            activeOpacity={0.8}
            accessibilityRole="button"
            id="btn-view-explainability"
          >
            <Text style={styles.secondaryActionText}>VIEW IMAGE ANALYSIS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryActionButton, Shadows.sm]}
            onPress={handleViewReport}
            activeOpacity={0.8}
            accessibilityRole="button"
            id="btn-view-report"
          >
            <Text style={styles.secondaryActionText}>VIEW FULL REPORT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.newScreeningButton, Shadows.sm]}
            onPress={handleNewScreening}
            activeOpacity={0.85}
            accessibilityRole="button"
            id="btn-new-screening-from-result"
          >
            <Text style={styles.newScreeningText}>START NEW SCREENING</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },

  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
  errorText: {
    fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg,
  },
  restartButton: {
    backgroundColor: Colors.primary, borderRadius: 0,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    borderWidth: 1, borderColor: Colors.primaryDark,
  },
  restartText: {
    color: Colors.textInverse, fontWeight: Typography.bold,
    fontSize: Typography.base, letterSpacing: Typography.trackWide,
  },

  header: { marginBottom: Spacing.md, marginTop: Spacing.sm },
  heading: {
    fontSize: Typography['2xl'], fontWeight: Typography.heavy, color: Colors.textPrimary,
  },
  timestamp: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },

  patientStrip: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.accentGold, borderRadius: 0,
    marginBottom: Spacing.base, overflow: 'hidden',
  },
  patientAccent: { width: 3, backgroundColor: Colors.accentGold },
  patientContent: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    gap: Spacing.md, flexWrap: 'wrap',
  },
  patientName: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  patientMeta: {
    fontSize: Typography.sm, color: Colors.textMuted,
    letterSpacing: Typography.trackWide, fontWeight: Typography.semibold,
  },

  section: { marginTop: Spacing.base },

  severityCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 0, marginTop: Spacing.base, overflow: 'hidden',
  },
  severityBlock: { padding: Spacing.base },
  severityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xs },
  severityGrade: { fontSize: Typography['2xl'], fontWeight: Typography.heavy },
  severityLabel: { fontSize: Typography.base, fontWeight: Typography.medium, marginTop: 2 },
  confidenceText: { fontSize: Typography.xs, fontWeight: Typography.semibold, marginTop: Spacing.xs },
  severityDescription: {
    fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20,
    padding: Spacing.base,
  },

  recommendationCard: {
    backgroundColor: Colors.surface, borderLeftWidth: 4,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
    gap: Spacing.xs,
  },
  priorityLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: Typography.trackWide },
  recommendationText: { fontSize: Typography.base, color: Colors.textPrimary, lineHeight: 22 },

  actions: { marginTop: Spacing.xl, gap: Spacing.md },
  secondaryActionButton: {
    backgroundColor: Colors.surface, borderRadius: 0,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.primary,
    minHeight: TouchTarget.minHeight,
  },
  secondaryActionText: {
    fontSize: Typography.sm, color: Colors.primary,
    fontWeight: Typography.bold, letterSpacing: Typography.trackWide,
  },
  newScreeningButton: {
    backgroundColor: Colors.primary, borderRadius: 0,
    paddingVertical: Spacing.lg, alignItems: 'center',
    minHeight: TouchTarget.minHeight, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primaryDark,
  },
  newScreeningText: {
    fontSize: Typography.md, fontWeight: Typography.bold,
    color: Colors.textInverse, letterSpacing: Typography.trackWide,
  },
});
