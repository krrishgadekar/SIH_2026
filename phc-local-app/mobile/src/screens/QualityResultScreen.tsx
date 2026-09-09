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
import QualityCard from '../components/QualityCard';
import ImagePreview from '../components/ImagePreview';
import { Colors, Typography, Spacing, Shadows, TouchTarget } from '../theme';

export default function QualityResultScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { state, setStep } = useScreening();

  const handleContinue = () => {
    setStep(4);
    navigation.navigate(Routes.Questionnaire);
  };

  const handleRetake = () => {
    navigation.navigate(Routes.Capture);
  };

  // If a full screening result already exists, show quality metrics from that result
  if (state.result) {
    const quality = state.result.imageQuality;
    const enhancement = state.result.enhancement;
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
          <QualityCard
            imageQuality={quality}
            enhancement={enhancement}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.continueButton, Shadows.sm]}
              onPress={handleContinue}
              activeOpacity={0.85}
              id="btn-quality-continue"
            >
              <Text style={styles.continueButtonText}>CONTINUE TO CLINICAL QUESTIONS →</Text>
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

  // Pre-analysis review mode: Preview the captured image without triggering the backend prediction API
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
            <Text style={styles.continueButtonText}>CONTINUE TO CLINICAL QUESTIONS →</Text>
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
