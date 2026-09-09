import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { QueueItem } from '../types/queue';
import { getSeverityDisplay } from '../utils/severityHelpers';
import { formatDateTime } from '../utils/dateHelpers';
import { Colors, Typography, Spacing, Shadows } from '../theme';

interface PatientProgressionTimelineProps {
  items: QueueItem[];
  onSelectRecord?: (item: QueueItem) => void;
}

export default function PatientProgressionTimeline({
  items,
  onSelectRecord,
}: PatientProgressionTimelineProps) {
  // Sort chronologically ascending for progression
  const sortedItems = [...items].sort(
    (a, b) =>
      new Date(a.session.createdAt).getTime() -
      new Date(b.session.createdAt).getTime(),
  );

  if (sortedItems.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No screening progression recorded yet.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, Shadows.sm]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerAccent} />
        <Text style={styles.headerTitle}>PATIENT PROGRESSION TIMELINE</Text>
        <Text style={styles.sessionCount}>{sortedItems.length} VISITS</Text>
      </View>

      {/* Timeline entries */}
      <View style={styles.timelineList}>
        {sortedItems.map((item, index) => {
          const result = item.session.result;
          const level = result?.severity?.level ?? 0;
          const display = getSeverityDisplay(level);
          const isLast = index === sortedItems.length - 1;

          // Compute progression delta compared to prior visit
          const prevItem = index > 0 ? sortedItems[index - 1] : null;
          const prevLevel = prevItem?.session?.result?.severity?.level;

          let deltaLabel = 'Baseline visit';
          let deltaColor = Colors.textMuted;

          if (prevLevel !== undefined) {
            const diff = level - prevLevel;
            if (diff > 0) {
              deltaLabel = `↑ Progressed (+${diff} ${diff === 1 ? 'grade' : 'grades'})`;
              deltaColor = diff >= 2 ? Colors.danger : Colors.warning;
            } else if (diff < 0) {
              deltaLabel = `↓ Improved (${diff} ${diff === -1 ? 'grade' : 'grades'})`;
              deltaColor = Colors.success;
            } else {
              deltaLabel = '→ Stable (No change)';
              deltaColor = Colors.success;
            }
          }

          const gradeBg =
            level === 0 ? Colors.successLight :
            level === 1 ? Colors.successLight :
            level === 2 ? Colors.warningLight :
            level === 3 ? Colors.dangerLight : 'rgba(123, 30, 30, 0.15)';

          return (
            <TouchableOpacity
              key={item.id}
              style={styles.nodeRow}
              onPress={() => onSelectRecord && onSelectRecord(item)}
              activeOpacity={onSelectRecord ? 0.75 : 1}
            >
              {/* Left timeline axis */}
              <View style={styles.axisContainer}>
                <View style={[styles.axisDot, { backgroundColor: display.colour }]} />
                {!isLast && <View style={styles.axisLine} />}
              </View>

              {/* Right content box */}
              <View style={styles.nodeContent}>
                <View style={styles.nodeTop}>
                  <Text style={styles.nodeDate}>
                    {formatDateTime(item.session.createdAt)}
                  </Text>
                  <View style={[styles.gradeBadge, { backgroundColor: gradeBg }]}>
                    <Text style={[styles.gradeText, { color: display.colour }]}>
                      GRADE {level} · {display.shortLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.nodeMetaRow}>
                  <Text style={[styles.deltaText, { color: deltaColor }]}>
                    {deltaLabel}
                  </Text>
                  {result?.referableDR?.isReferable && (
                    <View style={styles.referralTag}>
                      <Text style={styles.referralTagText}>REFERRAL</Text>
                    </View>
                  )}
                </View>

                {item.session.patient?.referenceId && (
                  <Text style={styles.patientIdText}>
                    PATIENT: {item.session.patient.name} ({item.session.patient.referenceId})
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  headerAccent: {
    width: 3,
    height: 14,
    backgroundColor: Colors.accentGold,
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
  },
  sessionCount: {
    fontSize: 9,
    fontWeight: Typography.heavy,
    color: Colors.primary,
    letterSpacing: 1,
  },

  timelineList: {
    padding: Spacing.base,
  },
  nodeRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  axisContainer: {
    width: 24,
    alignItems: 'center',
  },
  axisDot: {
    width: 12,
    height: 12,
    borderRadius: 0,
    marginTop: 3,
  },
  axisLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginTop: 4,
    marginBottom: -8,
  },
  nodeContent: {
    flex: 1,
    backgroundColor: Colors.surfaceDark,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 0,
    padding: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  nodeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nodeDate: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  gradeBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
  },
  gradeText: {
    fontSize: 9,
    fontWeight: Typography.heavy,
    letterSpacing: 0.5,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: Typography.semibold,
  },
  referralTag: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  referralTagText: {
    fontSize: 8,
    fontWeight: Typography.heavy,
    color: Colors.textInverse,
    letterSpacing: 0.5,
  },
  patientIdText: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 4,
    letterSpacing: Typography.trackNormal,
  },

  emptyContainer: {
    padding: Spacing.base,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
});
