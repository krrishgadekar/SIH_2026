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
import {
  DiabetesDuration, GlycemicControl, BloodPressure,
} from '../types/screening';
import { Colors, Typography, Spacing, Shadows, TouchTarget } from '../theme';

export default function QuestionnaireScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { state, updateQuestionnaire, setStep } = useScreening();

  // Risk factor state (maps to riskFactors nested object)
  const [yearsSinceDiagnosis, setYearsSinceDiagnosis] = useState<DiabetesDuration | null>(
    state.questionnaire.riskFactors.yearsSinceDiagnosis,
  );
  const [glycemicControl, setGlycemicControl] = useState<GlycemicControl | null>(
    state.questionnaire.riskFactors.glycemicControl,
  );
  const [bloodPressure, setBloodPressure] = useState<BloodPressure | null>(
    state.questionnaire.riskFactors.bloodPressure,
  );
  const [pregnant, setPregnant] = useState<boolean | null>(
    state.questionnaire.riskFactors.pregnant,
  );

  // Symptoms state (maps to symptoms object with boolean flags)
  const [blurredVision, setBlurredVision] = useState(state.questionnaire.symptoms.blurredVision);
  const [floaters, setFloaters] = useState(state.questionnaire.symptoms.floaters);
  const [suddenVisionChange, setSuddenVisionChange] = useState(state.questionnaire.symptoms.suddenVisionChange);
  const [eyePain, setEyePain] = useState(state.questionnaire.symptoms.eyePain);

  // Determine if patient could potentially be pregnant (age < 55 heuristic)
  const couldBePregnant = (state.patient?.age ?? 0) < 55;

  const handleContinue = () => {
    updateQuestionnaire({
      riskFactors: {
        yearsSinceDiagnosis,
        glycemicControl,
        bloodPressure,
        pregnant: couldBePregnant ? pregnant : null,
      },
      symptoms: {
        blurredVision,
        floaters,
        suddenVisionChange,
        eyePain,
      },
    });
    setStep(5);
    navigation.navigate(Routes.Processing);
  };

  const toggleSymptom = (
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    current: boolean,
  ) => setter(!current);

  const symptoms: { label: string; value: boolean; setter: React.Dispatch<React.SetStateAction<boolean>> }[] = [
    { label: 'Blurred Vision', value: blurredVision, setter: setBlurredVision },
    { label: 'Floaters',       value: floaters,       setter: setFloaters },
    { label: 'Sudden Vision Change', value: suddenVisionChange, setter: setSuddenVisionChange },
    { label: 'Eye Pain',       value: eyePain,        setter: setEyePain },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StepIndicator currentStep={4} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Clinical Questions</Text>

        {/* Clinical context note */}
        <View style={styles.contextNote}>
          <View style={styles.contextAccent} />
          <View style={styles.contextContent}>
            <Text style={styles.contextNoteLabel}>CLINICAL CONTEXT</Text>
            <Text style={styles.contextNoteText}>
              These answers provide clinical context and triage support.
              They do not override the image model's assessment.
            </Text>
          </View>
        </View>

        {/* Diabetes duration */}
        <ButtonGroupField
          label="Years since diabetes diagnosis"
          options={[
            { value: 'lt1',   label: '< 1 year' },
            { value: '1to5',  label: '1–5 years' },
            { value: '5to10', label: '5–10 years' },
            { value: 'gt10',  label: '> 10 years' },
          ]}
          value={yearsSinceDiagnosis}
          onSelect={(v) => setYearsSinceDiagnosis(v as DiabetesDuration)}
        />

        {/* Glycemic control */}
        <ButtonGroupField
          label="Glycemic control (blood sugar)"
          options={[
            { value: 'good',     label: 'Good' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'poor',     label: 'Poor' },
          ]}
          value={glycemicControl}
          onSelect={(v) => setGlycemicControl(v as GlycemicControl)}
        />

        {/* Blood pressure */}
        <ButtonGroupField
          label="Blood pressure"
          options={[
            { value: 'normal',  label: 'Normal' },
            { value: 'high',    label: 'High' },
            { value: 'unknown', label: 'Unknown' },
          ]}
          value={bloodPressure}
          onSelect={(v) => setBloodPressure(v as BloodPressure)}
        />

        {/* Pregnancy — conditional */}
        {couldBePregnant && (
          <ButtonGroupField
            label="Currently pregnant?"
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no',  label: 'No' },
            ]}
            value={pregnant === null ? null : pregnant ? 'yes' : 'no'}
            onSelect={(v) => setPregnant(v === 'yes')}
          />
        )}

        {/* Symptoms — multi-select */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>CURRENT EYE SYMPTOMS</Text>
          <Text style={styles.fieldHint}>Select all that apply</Text>
          <View style={styles.symptomGrid}>
            {symptoms.map((sym) => (
              <TouchableOpacity
                key={sym.label}
                style={[styles.symptomButton, sym.value && styles.symptomButtonSelected]}
                onPress={() => toggleSymptom(sym.setter, sym.value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sym.value }}
                activeOpacity={0.75}
              >
                <View style={[styles.symptomCheckBox, sym.value && styles.symptomCheckBoxSelected]}>
                  <Text style={[styles.symptomCheck, sym.value && styles.symptomCheckSelected]}>
                    {sym.value ? '✓' : ''}
                  </Text>
                </View>
                <Text style={[styles.symptomText, sym.value && styles.symptomTextSelected]}>
                  {sym.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Continue */}
        <TouchableOpacity
          style={[styles.continueButton, Shadows.sm]}
          onPress={handleContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue to analysis"
          id="btn-questionnaire-continue"
        >
          <Text style={styles.continueText}>CONTINUE TO ANALYSIS →</Text>
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
    marginBottom: Spacing.md,
    marginTop: Spacing.md,
  },

  contextNote: {
    flexDirection: 'row',
    backgroundColor: Colors.accentGoldLight,
    borderWidth: 1,
    borderColor: Colors.accentGold,
    borderRadius: 0,
    marginBottom: Spacing.xl,
    overflow: 'hidden',
  },
  contextAccent: {
    width: 3,
    backgroundColor: Colors.accentGold,
  },
  contextContent: {
    flex: 1,
    padding: Spacing.md,
  },
  contextNoteLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.accentGoldDark,
    letterSpacing: Typography.trackWide,
    marginBottom: 2,
  },
  contextNoteText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
    fontWeight: Typography.medium,
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
  symptomGrid: {
    gap: Spacing.sm,
  },
  symptomButton: {
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
  symptomButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
  },
  symptomCheckBox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  symptomCheckBoxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  symptomCheck: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
  },
  symptomCheckSelected: {
    color: Colors.textInverse,
  },
  symptomText: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  symptomTextSelected: {
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
