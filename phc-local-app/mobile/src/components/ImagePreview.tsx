import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Shadows } from '../theme';

interface ImagePreviewProps {
  uri: string | null | undefined;
  label?: string;
  onRetake?: () => void;
  style?: ViewStyle;
}

export default function ImagePreview({ uri, label, onRetake, style }: ImagePreviewProps) {
  if (!uri) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>NO IMAGE</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, Shadows.sm, style]}>
      {label && (
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      )}
      <View style={styles.imageFrame}>
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      </View>
      {onRetake && (
        <TouchableOpacity
          style={styles.retakeButton}
          onPress={onRetake}
          activeOpacity={0.75}
        >
          <Text style={styles.retakeText}>RETAKE</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: Colors.accentGold,
    borderRadius: 0,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  label: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  imageFrame: {
    aspectRatio: 4 / 3,
    backgroundColor: Colors.neutral800,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  retakeButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  retakeText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.primary,
    letterSpacing: Typography.trackWide,
  },
  placeholder: {
    aspectRatio: 4 / 3,
    backgroundColor: Colors.surfaceDark,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
  },
});
