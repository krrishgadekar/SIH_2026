import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import StepIndicator from '../components/StepIndicator';
import { PatientInfo } from '../types/screening';
import { Colors, Typography, Spacing, Shadows, TouchTarget, Animations } from '../theme';

export default function PatientRegistrationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { setPatient } = useScreening();

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Focus glow animation
  const nameBorderAnim = useRef(new Animated.Value(0)).current;
  const ageBorderAnim = useRef(new Animated.Value(0)).current;
  const refBorderAnim = useRef(new Animated.Value(0)).current;

  const animateFocus = (anim: Animated.Value, focused: boolean) => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const getBorderColor = (anim: Animated.Value, hasError: boolean) => {
    if (hasError) return Colors.danger;
    return anim.interpolate({
      inputRange: [0, 1],
      outputRange: [Colors.border, Colors.primary],
    });
  };

  // Staggered entry
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: Animations.fadeInDuration,
      useNativeDriver: true,
    }).start();
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Patient name is required.';
    const ageNum = parseInt(age, 10);
    if (!age.trim() || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      newErrors.age = 'Enter a valid age (1–120).';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (!validate()) return;
    const patient: PatientInfo = {
      name: name.trim(),
      age: parseInt(age, 10),
      referenceId: referenceId.trim(),
    };
    setPatient(patient);
    navigation.navigate(Routes.Capture);
  };

  const isFormValid = name.trim().length > 0 && age.trim().length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StepIndicator currentStep={1} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          style={{ opacity: fadeAnim }}
        >
          <Text style={styles.heading}>Patient Details</Text>
          <Text style={styles.subheading}>
            Enter the patient's information before capturing the retinal image.
          </Text>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>FULL NAME <Text style={styles.required}>*</Text></Text>
            <Animated.View style={[
              styles.inputWrapper,
              { borderColor: getBorderColor(nameBorderAnim, !!errors.name) },
            ]}>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: '' })); }}
                onFocus={() => animateFocus(nameBorderAnim, true)}
                onBlur={() => animateFocus(nameBorderAnim, false)}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Patient full name"
                id="input-patient-name"
              />
            </Animated.View>
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
          </View>

          {/* Age */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>AGE (YEARS) <Text style={styles.required}>*</Text></Text>
            <Animated.View style={[
              styles.inputWrapper,
              styles.inputNarrow,
              { borderColor: getBorderColor(ageBorderAnim, !!errors.age) },
            ]}>
              <TextInput
                style={styles.input}
                placeholder="e.g. 52"
                placeholderTextColor={Colors.textMuted}
                value={age}
                onChangeText={(t) => { setAge(t); setErrors((e) => ({ ...e, age: '' })); }}
                onFocus={() => animateFocus(ageBorderAnim, true)}
                onBlur={() => animateFocus(ageBorderAnim, false)}
                keyboardType="numeric"
                maxLength={3}
                returnKeyType="next"
                accessibilityLabel="Patient age"
                id="input-patient-age"
              />
            </Animated.View>
            {errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}
          </View>

          {/* Reference / Contact ID */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>PHC REFERENCE / CONTACT ID</Text>
            <Animated.View style={[
              styles.inputWrapper,
              { borderColor: getBorderColor(refBorderAnim, false) },
            ]}>
              <TextInput
                style={styles.input}
                placeholder="e.g. PHC-2024-00123"
                placeholderTextColor={Colors.textMuted}
                value={referenceId}
                onChangeText={setReferenceId}
                onFocus={() => animateFocus(refBorderAnim, true)}
                onBlur={() => animateFocus(refBorderAnim, false)}
                autoCapitalize="characters"
                returnKeyType="done"
                accessibilityLabel="PHC reference or contact identifier"
                id="input-reference-id"
              />
            </Animated.View>
            <Text style={styles.hint}>
              Optional. Used to link this screening to the patient's PHC record.
            </Text>
          </View>

          {/* Continue button */}
          <TouchableOpacity
            style={[styles.continueButton, !isFormValid && styles.continueButtonDisabled, Shadows.sm]}
            onPress={handleContinue}
            disabled={!isFormValid}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue to image capture"
            accessibilityState={{ disabled: !isFormValid }}
            id="btn-patient-continue"
          >
            <Text style={[styles.continueText, !isFormValid && styles.continueTextDisabled]}>
              CONTINUE →
            </Text>
          </TouchableOpacity>
        </Animated.ScrollView>
      </KeyboardAvoidingView>
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
    marginBottom: Spacing['2xl'],
  },

  fieldGroup: { marginBottom: Spacing.lg },
  label: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  required: { color: Colors.danger },
  inputWrapper: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    minHeight: TouchTarget.minHeight,
  },
  input: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: Typography.md,
    color: Colors.textPrimary,
    minHeight: TouchTarget.minHeight,
  },
  inputNarrow: { width: 120 },
  errorText: {
    fontSize: Typography.sm,
    color: Colors.danger,
    marginTop: Spacing.xs,
    fontWeight: Typography.medium,
  },
  hint: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    lineHeight: 18,
  },

  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: TouchTarget.minHeight,
    marginTop: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  continueButtonDisabled: {
    backgroundColor: Colors.disabled,
    borderColor: Colors.border,
  },
  continueText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
    letterSpacing: Typography.trackWide,
  },
  continueTextDisabled: {
    color: Colors.disabledText,
  },
});
