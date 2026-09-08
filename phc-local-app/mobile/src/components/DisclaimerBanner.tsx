import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

export default function DisclaimerBanner() {
  return (
    <View style={styles.container}>
      <View style={styles.accentLine} />
      <View style={styles.content}>
        <Text style={styles.icon}>⚕</Text>
        <Text style={styles.text}>
          This tool supports screening and does not replace clinical diagnosis.
          Always consult a qualified ophthalmologist for final assessment.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: Colors.accentGold,
    borderRadius: 0,
    backgroundColor: Colors.accentGoldLight,
    overflow: 'hidden',
  },
  accentLine: {
    height: 2,
    backgroundColor: Colors.accentGold,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  icon: {
    fontSize: Typography.md,
    color: Colors.accentGoldDark,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
    fontWeight: Typography.medium,
  },
});
