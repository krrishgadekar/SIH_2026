import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

interface SyncBadgeProps {
  isOnline: boolean;
  pendingCount: number;
}

export default function SyncBadge({ isOnline, pendingCount }: SyncBadgeProps) {
  const dotColor = isOnline ? Colors.success : Colors.danger;
  const borderColor = pendingCount > 0 ? Colors.accentGold : Colors.border;

  return (
    <View style={[styles.container, { borderColor }]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.label}>
        {isOnline ? 'ONLINE' : 'OFFLINE'}
      </Text>
      {pendingCount > 0 && (
        <Text style={styles.pending}>· {pendingCount}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 0,
  },
  label: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
    letterSpacing: Typography.trackWide,
    textTransform: 'uppercase',
  },
  pending: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.accentGold,
    letterSpacing: Typography.trackWide,
  },
});
