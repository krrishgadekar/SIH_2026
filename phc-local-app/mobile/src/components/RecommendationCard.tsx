import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Recommendation } from '../types/screening';
import { getPriorityColour, getPriorityBackground } from '../utils/severityHelpers';
import { Colors, Typography, Spacing } from '../theme';

interface RecommendationCardProps {
  recommendation: Recommendation;
}

export default function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const priorityColour = getPriorityColour(recommendation.priority);
  const priorityBg = getPriorityBackground(recommendation.priority);

  return (
    <View style={styles.card}>
      {/* Priority accent line */}
      <View style={[styles.accentLine, { backgroundColor: priorityColour }]} />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>RECOMMENDATION</Text>
          <View style={[styles.priorityTag, { backgroundColor: priorityBg, borderColor: priorityColour }]}>
            <Text style={[styles.priorityText, { color: priorityColour }]}>
              {recommendation.priority.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.actionText}>{recommendation.action}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  accentLine: {
    height: 3,
  },
  content: {
    padding: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
  },
  priorityTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 0,
  },
  priorityText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  actionText: {
    fontSize: Typography.base,
    color: Colors.textPrimary,
    lineHeight: 22,
    fontWeight: Typography.medium,
  },
});
