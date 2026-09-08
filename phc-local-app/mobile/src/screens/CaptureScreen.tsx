import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import { useCamera } from '../hooks/useCamera';
import StepIndicator from '../components/StepIndicator';
import ImagePreview from '../components/ImagePreview';
import CaptureGuidancePanel from '../components/CaptureGuidancePanel';
import { Colors, Typography, Spacing, Shadows, TouchTarget } from '../theme';

export default function CaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { setImage } = useScreening();
  const { openCamera, openImagePicker } = useCamera();

  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedMimeType, setCapturedMimeType] = useState<string>('image/jpeg');
  const [capturedFilename, setCapturedFilename] = useState<string>('retina.jpg');
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenCamera = async () => {
    setIsLoading(true);
    const image = await openCamera();
    setIsLoading(false);
    if (image) {
      setCapturedUri(image.uri);
      setCapturedMimeType(image.mimeType || 'image/jpeg');
      setCapturedFilename(image.filename || `retina_${Date.now()}.jpg`);
    }
  };

  const handleUploadImage = async () => {
    setIsLoading(true);
    const image = await openImagePicker();
    setIsLoading(false);
    if (image) {
      setCapturedUri(image.uri);
      setCapturedMimeType(image.mimeType || 'image/jpeg');
      setCapturedFilename(image.filename || `retina_upload_${Date.now()}.jpg`);
    }
  };

  const handleRetake = () => {
    Alert.alert(
      'Retake Image',
      'Do you want to take a new photo or upload a different image?',
      [
        { text: 'Open Camera',    onPress: handleOpenCamera },
        { text: 'Upload Image',   onPress: handleUploadImage },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleContinue = () => {
    if (!capturedUri) return;
    setImage(capturedUri, capturedMimeType, capturedFilename);
    navigation.navigate(Routes.Questionnaire);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StepIndicator currentStep={2} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Capture Retinal Image</Text>
        <Text style={styles.subheading}>
          Take a clear, well-lit photo of the patient's retina using a fundus camera or smartphone.
        </Text>

        {/* Feature 4: Smart Capture Guidance Panel */}
        <CaptureGuidancePanel
          hasCapturedImage={!!capturedUri}
          onRetake={handleRetake}
          actionInstruction={
            capturedUri
              ? 'Retina centered · Quality check passed'
              : 'Hold steady · Center retina · Improve lighting'
          }
        />

        {/* Capture options — shown only when no image selected */}
        {!capturedUri && (
          <View style={styles.captureOptions}>
            {/* Camera */}
            <TouchableOpacity
              style={[styles.captureCard, Shadows.sm]}
              onPress={handleOpenCamera}
              disabled={isLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open camera to capture retinal image"
              id="btn-open-camera"
            >
              <View style={styles.captureIconBox}>
                <Text style={styles.captureIcon}>📷</Text>
              </View>
              <View style={styles.captureTextBox}>
                <Text style={styles.captureTitle}>OPEN CAMERA</Text>
                <Text style={styles.captureDesc}>
                  Take a photo directly using the device camera.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Upload */}
            <TouchableOpacity
              style={[styles.captureCard, Shadows.sm]}
              onPress={handleUploadImage}
              disabled={isLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Upload image from device gallery"
              id="btn-upload-image"
            >
              <View style={styles.captureIconBox}>
                <Text style={styles.captureIcon}>🖼</Text>
              </View>
              <View style={styles.captureTextBox}>
                <Text style={styles.captureTitle}>UPLOAD IMAGE</Text>
                <Text style={styles.captureDesc}>
                  Select an existing retinal image from your device.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading state */}
        {isLoading && (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>OPENING…</Text>
          </View>
        )}

        {/* Preview + actions */}
        {capturedUri && (
          <View style={styles.previewSection}>
            <ImagePreview
              uri={capturedUri}
              label="Selected Image"
              onRetake={handleRetake}
            />

            <TouchableOpacity
              style={[styles.continueButton, Shadows.sm]}
              onPress={handleContinue}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue to quality check"
              id="btn-capture-continue"
            >
              <Text style={styles.continueText}>CONTINUE TO CLINICAL QUESTIONS →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tips */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>IMAGING GUIDELINES</Text>
          <View style={styles.tipsDivider} />
          {[
            'Good lighting — avoid very bright or dim conditions.',
            'Ask the patient to keep their eye open and look straight ahead.',
            'Hold the camera steady for a sharp, blur-free photo.',
            'Ensure the full retina is visible in the frame.',
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={styles.tipBullet} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
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
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  subheading: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.base,
  },

  captureOptions: {
    gap: Spacing.base,
    marginBottom: Spacing.xl,
  },
  captureCard: {
    backgroundColor: Colors.surface,
    borderRadius: 0,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    gap: Spacing.base,
  },
  captureIconBox: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.accentGold,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentGoldLight,
  },
  captureIcon: { fontSize: 24 },
  captureTextBox: { flex: 1 },
  captureTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.primary,
    letterSpacing: Typography.trackWide,
    marginBottom: 2,
  },
  captureDesc: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  loadingBox: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
    fontWeight: Typography.bold,
  },

  previewSection: { marginBottom: Spacing.xl },

  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: TouchTarget.minHeight,
    marginTop: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  continueText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
    letterSpacing: Typography.trackWide,
  },

  tipsBox: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 0,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tipsTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.primary,
    letterSpacing: Typography.trackUltraWide,
  },
  tipsDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
    alignItems: 'flex-start',
  },
  tipBullet: {
    width: 4,
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: 0,
    marginRight: Spacing.sm,
    marginTop: 6,
  },
  tipText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
