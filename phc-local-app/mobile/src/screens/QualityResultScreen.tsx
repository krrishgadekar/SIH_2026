import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import StepIndicator from '../components/StepIndicator';
import ImagePreview from '../components/ImagePreview';
import { Colors, Typography, Spacing, Shadows, TouchTarget } from '../theme';

/**
 * QualityResultScreen — Step 3
 *
 * The mobile app runs a local quality gate via expo-image-manipulator
 * (Phase 4). This screen shows the result of that gate (stored in
 * state.qualityGateResult) and lets the technician decide whether to
 * proceed or retake.
 *
 * If no local gate result is available yet (e.g., the gate hasn't run),
 * we skip to a "review image" mode and let the technician decide.
 */
export default function QualityResultScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { state, setStep } = useScreening();
  const qualityResult = state.qualityGateResult;

  const handleContinue = () => {
    // Step indicator stays 3 for metadata
    navigation.navigate(Routes.CaptureMetadata);
  };

  const handleRetake = () => {
    navigation.navigate(Routes.Capture);
  };

  // ── Quality gate ran locally ────────────────────────────────────────────
  if (qualityResult) {
    const isRetake = qualityResult.status === 'retake';
    const isBorderline = qualityResult.status === 'borderline';

    const statusLabel =
      qualityResult.status === 'pass'       ? 'PASS'
      : qualityResult.status === 'borderline' ? 'BORDERLINE'
      : 'RETAKE RECOMMENDED';

    const statusColor =
      qualityResult.status === 'pass'       ? Colors.success
      : qualityResult.status === 'borderline' ? Colors.warning
      : Colors.danger;

    const reasonLabels: Record<string, string> = {
      blur:              'Image is blurry',
      low_illumination:  'Insufficient illumination',
      insufficient_fov:  'Field of view too small',
      glare:             'Glare detected',
      motion_artifact:   'Motion artifact present',
      eyelash_occlusion: 'Eyelash occlusion',
    };

    const reasonText = qualityResult.reason ? reasonLabels[qualityResult.reason] ?? qualityResult.reason : null;

    return (
      <SafeAreaView style={styles.safe}>
        <StepIndicator currentStep={3} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>Image Quality Assessment</Text>
          <ImagePreview
            uri={state.imageUri}
            label="Captured Image"
            style={{ marginBottom: Spacing.base }}
          />

          {/* Quality gate result badge */}
          <View style={[styles.qualityBadge, { borderColor: statusColor, backgroundColor: `${statusColor}18` }]}>
            <View style={[styles.qualityAccent, { backgroundColor: statusColor }]} />
            <View style={styles.qualityContent}>
              <Text style={[styles.qualityStatus, { color: statusColor }]}>{statusLabel}</Text>
              {reasonText && (
                <Text style={styles.qualityReason}>{reasonText}</Text>
              )}
            </View>
          </View>

          <View style={styles.actions}>
            {/* Always allow continuing (borderline quality warning) */}
            {!isRetake && (
              <TouchableOpacity
                style={[styles.continueButton, Shadows.sm]}
                onPress={handleContinue}
                activeOpacity={0.85}
                id="btn-quality-continue"
              >
                <Text style={styles.continueButtonText}>
                  {isBorderline ? 'CONTINUE ANYWAY →' : 'CONTINUE →'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={isRetake ? [styles.continueButton, Shadows.sm] : styles.secondaryButton}
              onPress={handleRetake}
              activeOpacity={isRetake ? 0.85 : 0.75}
              id="btn-retake"
            >
              <Text style={isRetake ? styles.continueButtonText : styles.secondaryButtonText}>
                RETAKE IMAGE
              </Text>
            </TouchableOpacity>

            {/* If retake recommended but technician wants to override */}
            {isRetake && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleContinue}
                activeOpacity={0.75}
                id="btn-override-retake"
              >
                <Text style={styles.secondaryButtonText}>PROCEED DESPITE LOW QUALITY</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── No quality gate result yet — simple review mode ─────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StepIndicator currentStep={3} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Review Retinal Image</Text>
        <ImagePreview
          uri={state.imageUri}
          label="Selected Image"
          style={{ marginBottom: Spacing.base }}
        />
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.continueButton, Shadows.sm]}
            onPress={handleContinue}
            activeOpacity={0.85}
            id="btn-quality-continue"
          >
            <Text style={styles.continueButtonText}>CONTINUE →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleRetake}
            activeOpacity={0.75}
            id="btn-retake-optional"
          >
            <Text style={styles.secondaryButtonText}>RETAKE IMAGE</Text>
          </TouchableOpacity>
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
    marginTop: Spacing.md,
  },

  qualityBadge: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 0,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  qualityAccent: {
    width: 4,
  },
  qualityContent: {
    flex: 1,
    padding: Spacing.md,
  },
  qualityStatus: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  qualityReason: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    fontWeight: Typography.medium,
  },

  actions: { marginTop: Spacing.base, gap: Spacing.md },
  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: TouchTarget.minHeight,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  continueButtonText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
    letterSpacing: Typography.trackWide,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    minHeight: TouchTarget.minHeight,
  },
  secondaryButtonText: {
    fontSize: Typography.base,
    color: Colors.primary,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
});
