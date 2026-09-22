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
import SeverityCard from '../components/SeverityCard';
import RecommendationCard from '../components/RecommendationCard';
import DisclaimerBanner from '../components/DisclaimerBanner';
import HumanInTheLoopStatus from '../components/HumanInTheLoopStatus';
import { Colors, Typography, Spacing, Shadows, TouchTarget, Animations } from '../theme';
import { formatDateTime } from '../utils/dateHelpers';

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

  const handleViewDetails = () => {
    navigation.navigate(Routes.Explainability);
  };

  const handleViewReport = () => {
    navigation.navigate(Routes.Report);
  };

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
          <Text style={styles.timestamp}>{formatDateTime(result.processedAt)}</Text>
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

        {/* Feature 5: Human-in-the-Loop Status */}
        <Animated.View style={{ opacity: fadeAnims[1] }}>
          <HumanInTheLoopStatus
            currentStage="awaiting_doctor"
            isReferable={result.referableDR.isReferable}
          />
        </Animated.View>

        {/* Feature 3: Main severity card with AI Decision Breakdown */}
        <Animated.View style={{ opacity: fadeAnims[2] }}>
          <SeverityCard
            severity={result.severity}
            referableDR={result.referableDR}
            confidence={result.confidence}
            recommendation={result.recommendation}
          />
        </Animated.View>

        {/* Recommendation */}
        <Animated.View style={[styles.section, { opacity: fadeAnims[3] }]}>
          <RecommendationCard recommendation={result.recommendation} />
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
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  restartText: {
    color: Colors.textInverse,
    fontWeight: Typography.bold,
    fontSize: Typography.base,
    letterSpacing: Typography.trackWide,
  },

  header: { marginBottom: Spacing.md, marginTop: Spacing.sm },
  heading: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.heavy,
    color: Colors.textPrimary,
  },
  timestamp: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },

  patientStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentGold,
    borderRadius: 0,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  patientAccent: {
    width: 3,
    backgroundColor: Colors.accentGold,
  },
  patientContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  patientName: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  patientMeta: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
    fontWeight: Typography.semibold,
  },

  section: { marginTop: Spacing.base },

  actions: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  secondaryActionButton: {
    backgroundColor: Colors.surface,
    borderRadius: 0,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    minHeight: TouchTarget.minHeight,
  },
  secondaryActionText: {
    fontSize: Typography.sm,
    color: Colors.primary,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  newScreeningButton: {
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: TouchTarget.minHeight,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  newScreeningText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
    letterSpacing: Typography.trackWide,
  },
});
