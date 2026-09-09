import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import { uploadImageForScreening, NetworkError, TimeoutError, InvalidImageError } from '../api/client';
import { Colors, Typography, Spacing, Shadows, Animations } from '../theme';

const STEPS = [
  'Uploading image…',
  'Analysing image quality…',
  'Running AI model…',
  'Preparing result…',
];

export default function ProcessingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { state, setResult } = useScreening();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Spinner rotation
  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [spinAnim]);

  // Scan line sweep animation
  const scanAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: Animations.scanLineDuration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ).start();
  }, [scanAnim]);

  // Pulse glow for spinner
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  const executeAnalysis = React.useCallback(async () => {
    setErrorMsg(null);
    setCurrentStepIdx(0);

    const stepTimer1 = setTimeout(() => { setCurrentStepIdx(1); }, 1000);
    const stepTimer2 = setTimeout(() => { setCurrentStepIdx(2); }, 2500);

    try {
      if (!state.imageUri) {
        throw new Error('No retinal image found. Please retake the image.');
      }

      const screeningResult = await uploadImageForScreening(
        state.imageUri,
        state.imageFilename,
        state.imageMimeType,
      );

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setCurrentStepIdx(3);

      setResult(screeningResult);

      setTimeout(() => {
        navigation.replace(Routes.Result);
      }, 800);
    } catch (err: unknown) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      let userMsg = 'Failed to analyze retinal image. Please check your connection and try again.';
      if (err instanceof TimeoutError) {
        userMsg = 'Analysis timed out. The server took too long to respond. Please retry.';
      } else if (err instanceof NetworkError) {
        userMsg = 'Network connection failed. Please verify your internet or ngrok URL.';
      } else if (err instanceof InvalidImageError) {
        userMsg = err.message || 'The uploaded file could not be identified as a valid retinal image.';
      } else if (err instanceof Error) {
        userMsg = err.message;
      }
      setErrorMsg(userMsg);
    }
  }, [state.imageUri, state.imageFilename, state.imageMimeType, navigation, setResult]);

  useEffect(() => {
    executeAnalysis();
  }, [executeAnalysis]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  const glowShadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  if (errorMsg) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.errorIconBox}>
            <Text style={styles.errorIcon}>⚠</Text>
          </View>
          <Text style={styles.title}>ANALYSIS FAILED</Text>
          <Text style={styles.subtitle}>{errorMsg}</Text>

          <TouchableOpacity
            style={[styles.retryBtn, Shadows.md]}
            onPress={executeAnalysis}
            activeOpacity={0.85}
          >
            <Text style={styles.retryBtnText}>TRY AGAIN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate(Routes.Capture)}
            activeOpacity={0.75}
          >
            <Text style={styles.backBtnText}>RETAKE IMAGE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Scan line sweep */}
        <Animated.View
          style={[
            styles.scanLine,
            { transform: [{ translateY: scanTranslateY }] },
          ]}
        />

        {/* Spinner with pulsing glow */}
        <Animated.View style={[styles.spinnerGlow, { shadowOpacity: glowShadowOpacity }]}>
          <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]}>
            <View style={styles.spinnerDot} />
          </Animated.View>
        </Animated.View>

        <Text style={styles.title}>ANALYSING RETINAL IMAGE</Text>
        <Text style={styles.subtitle}>Please wait — this takes a few seconds.</Text>

        {/* Step progress */}
        <View style={styles.stepList}>
          {STEPS.map((step, idx) => {
            const done    = idx < currentStepIdx;
            const current = idx === currentStepIdx;
            return (
              <View key={step} style={styles.stepRow}>
                <View style={[
                  styles.stepMarker,
                  done    && styles.stepMarkerDone,
                  current && styles.stepMarkerCurrent,
                ]}>
                  <Text style={[
                    styles.stepMarkerText,
                    done    && styles.stepMarkerTextDone,
                    current && styles.stepMarkerTextCurrent,
                  ]}>
                    {done ? '✓' : '·'}
                  </Text>
                </View>
                <Text style={[
                  styles.stepText,
                  done    && styles.stepTextDone,
                  current && styles.stepTextCurrent,
                ]}>
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
    gap: Spacing.md,
    overflow: 'hidden',
  },

  // Scan line
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.primary,
    opacity: 0.3,
  },

  // Spinner
  spinnerGlow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 10,
    marginBottom: Spacing.md,
  },
  spinner: {
    width: 80,
    height: 80,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderTopColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerDot: {
    width: 8,
    height: 8,
    backgroundColor: Colors.primary,
    borderRadius: 0,
  },

  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.heavy,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: Typography.trackWide,
  },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },

  stepList: {
    alignSelf: 'stretch',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepMarker: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  stepMarkerDone: {
    backgroundColor: Colors.accentGold,
    borderColor: Colors.accentGoldDark,
  },
  stepMarkerCurrent: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  stepMarkerText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
  },
  stepMarkerTextDone: {
    color: Colors.surfaceElevated,
  },
  stepMarkerTextCurrent: {
    color: Colors.textInverse,
  },
  stepText: {
    fontSize: Typography.base,
    color: Colors.textMuted,
  },
  stepTextDone: {
    color: Colors.accentGoldDark,
    fontWeight: Typography.semibold,
  },
  stepTextCurrent: {
    color: Colors.textPrimary,
    fontWeight: Typography.bold,
  },

  // Error state
  errorIconBox: {
    width: 64,
    height: 64,
    borderWidth: 2,
    borderColor: Colors.danger,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    backgroundColor: Colors.dangerLight,
  },
  errorIcon: {
    fontSize: 28,
    color: Colors.danger,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  retryBtnText: {
    color: Colors.textInverse,
    fontWeight: Typography.bold,
    fontSize: Typography.base,
    letterSpacing: Typography.trackWide,
  },
  backBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
    width: '100%',
    alignItems: 'center',
  },
  backBtnText: {
    color: Colors.primary,
    fontWeight: Typography.bold,
    fontSize: Typography.base,
    letterSpacing: Typography.trackWide,
  },
});
