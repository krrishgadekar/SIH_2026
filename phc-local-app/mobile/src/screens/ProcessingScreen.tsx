import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import { useQueue } from '../context/QueueContext';
import {
  createCaseSummary,
  uploadCaseImageSingle,
  getCaseStatus,
  getCaseDetail,
  NetworkError,
  TimeoutError,
  InvalidImageError,
  ServerError,
} from '../api/client';
import { generateLocalId } from '../utils/idGenerator';
import { Colors, Typography, Spacing, Shadows, Animations } from '../theme';

const STEPS = [
  'Registering case…',
  'Uploading retinal image…',
  'AI model analysing…',
  'Preparing result…',
];

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20; // 60 seconds

export default function ProcessingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { state, setResult, setCentralCaseId } = useScreening();
  const { enqueue } = useQueue();

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isQueued, setIsQueued] = useState(false);

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
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    ).start();
  }, [pulseAnim]);

  const executeAnalysis = useCallback(async () => {
    setErrorMsg(null);
    setIsQueued(false);
    setCurrentStepIdx(0);

    try {
      if (!state.imageUri) {
        throw new Error('No retinal image found. Please retake the image.');
      }
      if (!state.patient) {
        throw new Error('No patient information. Please restart the screening.');
      }

      // ── Step 1: POST /cases/summary ────────────────────────────────────
      setCurrentStepIdx(0);

      const captureId = state.sessionId;
      const patientId = state.patient.id ?? generateLocalId();

      const summaryPayload = {
        caseId: captureId,
        patientId,
        patientName: state.patient.name,
        patientAge: state.patient.age,
        patientContact: state.patient.contactNumber || '',
        patientReference: state.patient.referenceId || '',
        questionnaireData: state.questionnaire,
        captureMetadata: state.captureMetadata ?? {
          cameraDeviceReported: 'unknown',
          pupilStatus: 'unknown',
          lightingEnvironment: 'indoor_clinic',
          observedIssues: ['none_noticed'],
          workerUsabilityRating: 'clear',
          eyeLaterality: state.eyeLaterality ?? undefined,
        },
        eyeLaterality: state.eyeLaterality,
        capturedAt: new Date().toISOString(),
      };

      const summaryResp = await createCaseSummary(summaryPayload);
      const caseId = summaryResp.caseId ?? captureId;
      setCentralCaseId(caseId);

      // ── Step 2: Upload image ───────────────────────────────────────────
      setCurrentStepIdx(1);

      const uploadPayload = {
        caseId,
        patientId,
        eyeLaterality: state.eyeLaterality ?? 'unknown',
      };

      await uploadCaseImageSingle(uploadPayload, state.imageUri);

      // ── Step 3: Poll for status ────────────────────────────────────────
      setCurrentStepIdx(2);

      let attempts = 0;
      let graded = false;

      while (attempts < MAX_POLL_ATTEMPTS) {
        await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
        attempts++;

        const statusResp = await getCaseStatus(caseId);
        if (statusResp.status === 'graded') {
          graded = true;
          break;
        }
        if (statusResp.status === 'error') {
          throw new ServerError(500, `Backend processing failed for case ${caseId}`);
        }
      }

      if (!graded) {
        throw new TimeoutError('Analysis timed out waiting for the AI model. The case has been queued for sync.');
      }

      // ── Step 4: Fetch full result ──────────────────────────────────────
      setCurrentStepIdx(3);

      const detail = await getCaseDetail(caseId);
      setResult(detail);

      setTimeout(() => {
        navigation.replace(Routes.Result);
      }, 600);

    } catch (err: unknown) {
      let userMsg = 'Failed to analyze retinal image. Please check your connection and try again.';
      let shouldQueue = true;

      if (err instanceof InvalidImageError) {
        userMsg = err.message || 'The uploaded file could not be identified as a valid retinal image.';
        shouldQueue = false; // image-level error — retake needed, not a retry
      } else if (err instanceof TimeoutError) {
        userMsg = 'Analysis timed out. The case has been saved and will auto-sync when the server is available.';
      } else if (err instanceof NetworkError) {
        userMsg = 'Network connection failed. The case has been saved and will auto-sync when you are back online.';
      } else if (err instanceof ServerError && err.statusCode >= 500) {
        userMsg = 'Server error. The case has been saved and will auto-sync shortly.';
      } else if (err instanceof Error) {
        userMsg = err.message;
        shouldQueue = false;
      }

      // Enqueue for offline retry if applicable
      if (shouldQueue && state.patient && state.imageUri) {
        try {
          await enqueue({
            id: state.sessionId,
            patient: state.patient,
            imageUri: state.imageUri,
            eyeLaterality: state.eyeLaterality,
            questionnaire: state.questionnaire,
            captureMetadata: state.captureMetadata ?? undefined,
            qualityGateResult: state.qualityGateResult ?? undefined,
            centralCaseId: state.centralCaseId ?? undefined,
            result: null,
            createdAt: new Date().toISOString(),
            syncStatus: 'pending',
          });
          setIsQueued(true);
        } catch (queueErr) {
          console.error('Failed to queue session:', queueErr);
        }
      }

      setErrorMsg(userMsg);
    }
  }, [state, navigation, setResult, setCentralCaseId, enqueue]);

  useEffect(() => {
    executeAnalysis();
  }, []); // Run once on mount

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
            <Text style={styles.errorIcon}>{isQueued ? '🕐' : '⚠'}</Text>
          </View>
          <Text style={styles.title}>{isQueued ? 'SAVED FOR SYNC' : 'ANALYSIS FAILED'}</Text>
          <Text style={styles.subtitle}>{errorMsg}</Text>

          {!isQueued && (
            <TouchableOpacity
              style={[styles.retryBtn, Shadows.md]}
              onPress={executeAnalysis}
              activeOpacity={0.85}
              id="btn-retry-analysis"
            >
              <Text style={styles.retryBtnText}>TRY AGAIN</Text>
            </TouchableOpacity>
          )}

          {isQueued ? (
            <TouchableOpacity
              style={[styles.retryBtn, Shadows.md]}
              onPress={() => navigation.navigate('MainTabs')}
              activeOpacity={0.85}
              id="btn-go-home-queued"
            >
              <Text style={styles.retryBtnText}>GO TO HOME</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.navigate(Routes.Capture)}
              activeOpacity={0.75}
              id="btn-retake-from-processing"
            >
              <Text style={styles.backBtnText}>RETAKE IMAGE</Text>
            </TouchableOpacity>
          )}
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

  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.primary,
    opacity: 0.3,
  },

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
