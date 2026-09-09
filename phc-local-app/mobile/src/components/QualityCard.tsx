import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

interface QualityCardProps {
  imageQuality: {
    status: string;
    qualityScore: number;
    metrics: Record<string, number>;
  };
  enhancement: {
    applied: boolean;
    steps: string[];
  };
  compact?: boolean;
}

export default function QualityCard({ imageQuality, enhancement, compact }: QualityCardProps) {
  const scorePercent = Math.round(imageQuality.qualityScore * 100);
  const statusColor =
    imageQuality.status === 'pass' ? Colors.success :
    imageQuality.status === 'borderline' ? Colors.warning : Colors.danger;

  return (
    <View style={styles.card}>
      {/* Status accent bar */}
      <View style={[styles.accentBar, { backgroundColor: statusColor }]} />

      <View style={styles.content}>
        {/* Status header */}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>IMAGE QUALITY</Text>
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {imageQuality.status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Score bar */}
        <View style={styles.scoreSection}>
          <View style={styles.scoreTrack}>
            <View
              style={[
                styles.scoreFill,
                {
                  width: `${scorePercent}%` as any,
                  backgroundColor: statusColor,
                },
              ]}
            />
          </View>
          <Text style={styles.scoreValue}>{scorePercent}%</Text>
        </View>

        {/* Enhancement info */}
        {enhancement.applied && (
          <View style={styles.enhanceRow}>
            <Text style={styles.enhanceLabel}>ENHANCED</Text>
            <Text style={styles.enhanceSteps}>
              {enhancement.steps.join(' → ')}
            </Text>
          </View>
        )}

        {/* Metrics (non-compact) */}
        {!compact && Object.entries(imageQuality.metrics).length > 0 && (
          <View style={styles.metricsSection}>
            {Object.entries(imageQuality.metrics).map(([key, value]) => {
              const label = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/Score$/, '')
                .trim();
              const pct = Math.round(value * 100);

              return (
                <View key={key} style={styles.metricRow}>
                  <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
                  <View style={styles.metricTrack}>
                    <View style={[styles.metricFill, { width: `${pct}%` as any }]} />
                  </View>
                  <Text style={styles.metricValue}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}
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
  accentBar: {
    height: 3,
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 0,
  },
  statusText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scoreTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceDark,
    borderRadius: 0,
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: 0,
  },
  scoreValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
    width: 36,
    textAlign: 'right',
  },
  enhanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  enhanceLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.accentGoldDark,
    letterSpacing: Typography.trackWide,
  },
  enhanceSteps: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  metricsSection: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    gap: Spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metricLabel: {
    width: 90,
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
    textTransform: 'uppercase',
  },
  metricTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surfaceDark,
    borderRadius: 0,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 0,
  },
  metricValue: {
    width: 30,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    fontWeight: Typography.semibold,
  },
});
