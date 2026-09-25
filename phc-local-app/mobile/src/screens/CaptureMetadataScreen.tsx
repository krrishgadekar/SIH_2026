import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import StepIndicator from '../components/StepIndicator';
import { ButtonGroupField } from '../components/QuestionnaireField';
import { Colors, Typography, Spacing, Shadows, TouchTarget } from '../theme';

export default function CaptureMetadataScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { state, setCaptureMetadata } = useScreening();

  const [pupilStatus, setPupilStatus] = useState<'dilated' | 'non_dilated' | 'unknown'>(
    (state.captureMetadata?.pupilStatus as any) ?? 'unknown'
  );
  const [lightingEnvironment, setLightingEnvironment] = useState<'indoor_clinic' | 'outdoor_mobile' | 'low_light'>(
    (state.captureMetadata?.lightingEnvironment as any) ?? 'indoor_clinic'
  );
  const [workerUsabilityRating, setWorkerUsabilityRating] = useState<'clear' | 'not_sure' | 'clearly_unusable'>(
    (state.captureMetadata?.workerUsabilityRating as any) ?? 'clear'
  );
  
  // Array of observed issues
  const [observedIssues, setObservedIssues] = useState<string[]>(
    state.captureMetadata?.observedIssues ?? ['none_noticed']
  );

  const toggleIssue = (issue: string) => {
    setObservedIssues(prev => {
      if (issue === 'none_noticed') return ['none_noticed'];
      
      const withoutNone = prev.filter(i => i !== 'none_noticed');
      if (withoutNone.includes(issue)) {
        const removed = withoutNone.filter(i => i !== issue);
        return removed.length === 0 ? ['none_noticed'] : removed;
      }
      return [...withoutNone, issue];
    });
  };

  const handleContinue = () => {
    setCaptureMetadata({
      cameraDeviceReported: 'mobile',
      pupilStatus,
      lightingEnvironment,
      observedIssues,
      workerUsabilityRating,
      eyeLaterality: state.eyeLaterality ?? undefined,
    });
    // Navigate to the next step, which is Questionnaire
    navigation.navigate(Routes.Questionnaire);
  };

  const issuesList = [
    { value: 'glare', label: 'Glare' },
    { value: 'blink_or_moved', label: 'Patient Blinked / Moved' },
    { value: 'out_of_focus', label: 'Out of Focus' },
    { value: 'media_opacity', label: 'Media Opacity (e.g. Cataract)' },
    { value: 'eyelash_obstruction', label: 'Eyelash Obstruction' },
    { value: 'none_noticed', label: 'None Noticed' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StepIndicator currentStep={3} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Capture Metadata</Text>
        <Text style={styles.subheading}>
          Provide details about the imaging conditions. This helps the AI model understand the context of the image.
        </Text>

        <ButtonGroupField
          label="Pupil Dilation"
          options={[
            { value: 'dilated', label: 'Dilated' },
            { value: 'non_dilated', label: 'Non-Dilated' },
            { value: 'unknown', label: 'Unknown' },
          ]}
          value={pupilStatus}
          onSelect={(v) => setPupilStatus(v as any)}
        />

        <ButtonGroupField
          label="Lighting Environment"
          options={[
            { value: 'indoor_clinic', label: 'Indoor Clinic' },
            { value: 'outdoor_mobile', label: 'Outdoor / Mobile' },
            { value: 'low_light', label: 'Low Light' },
          ]}
          value={lightingEnvironment}
          onSelect={(v) => setLightingEnvironment(v as any)}
        />

        <ButtonGroupField
          label="Your Assessment of Usability"
          options={[
            { value: 'clear', label: 'Clear / Usable' },
            { value: 'not_sure', label: 'Not Sure' },
            { value: 'clearly_unusable', label: 'Clearly Unusable' },
          ]}
          value={workerUsabilityRating}
          onSelect={(v) => setWorkerUsabilityRating(v as any)}
        />

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>OBSERVED ISSUES</Text>
          <Text style={styles.fieldHint}>Select all that apply</Text>
          <View style={styles.issueGrid}>
            {issuesList.map((issue) => {
              const selected = observedIssues.includes(issue.value);
              return (
                <TouchableOpacity
                  key={issue.value}
                  style={[styles.issueButton, selected && styles.issueButtonSelected]}
                  onPress={() => toggleIssue(issue.value)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.issueCheckBox, selected && styles.issueCheckBoxSelected]}>
                    <Text style={[styles.issueCheck, selected && styles.issueCheckSelected]}>
                      {selected ? '✓' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.issueText, selected && styles.issueTextSelected]}>
                    {issue.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, Shadows.sm]}
          onPress={handleContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          id="btn-metadata-continue"
        >
          <Text style={styles.continueText}>CONTINUE TO QUESTIONNAIRE →</Text>
        </TouchableOpacity>
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
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  subheading: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },

  fieldGroup: { marginBottom: Spacing.lg },
  fieldLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  fieldHint: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  issueGrid: {
    gap: Spacing.sm,
  },
  issueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: TouchTarget.minHeight,
    gap: Spacing.md,
  },
  issueButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
  },
  issueCheckBox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  issueCheckBoxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  issueCheck: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
  },
  issueCheckSelected: {
    color: Colors.textInverse,
  },
  issueText: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  issueTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.bold,
  },

  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: TouchTarget.minHeight,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  continueText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
    letterSpacing: Typography.trackWide,
  },
});
