/** LocalQueueTable's pipeline column: five dots plus a stage label. */
import React from 'react';
import { Text, View } from 'react-native';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { LifecycleStatus, QueueEntry } from '../types';

export const PIPELINE: Record<LifecycleStatus, { stage: number; label: string; action: string }> = {
  captured: { stage: 1, label: 'CAPTURED', action: 'RETAKE NEEDED' },
  quality_passed: { stage: 2, label: 'QUALITY PASS', action: 'WAITING (SYNC)' },
  synced: { stage: 3, label: 'SYNCED, AWAITING IMAGE', action: 'UPLOADING…' },
  result_pending: { stage: 4, label: 'AI PENDING', action: 'AI PROCESSING…' },
  result_delivered: { stage: 5, label: 'RESULT READY', action: 'VIEW RESULT →' },
};

export const PROBLEM_LABEL: Record<NonNullable<QueueEntry['problem']>, string> = {
  retrying: 'RETRYING SYNC',
  upload_failed: 'SYNC FAILED',
  grading_failed: 'GRADING FAILED',
};

export function StageIndicator({ lifecycle, problem }: { lifecycle: LifecycleStatus; problem: QueueEntry['problem'] }) {
  const s = useStyles();
  const { theme } = useTheme();
  const cfg = PIPELINE[lifecycle];
  const failed = problem === 'upload_failed' || problem === 'grading_failed';
  const color = failed ? theme.c.danger
    : problem === 'retrying' ? theme.c.warning
      : cfg.stage === 5 || cfg.stage <= 2 ? theme.c.success : theme.c.warning;
  return (
    <View style={s.wrap} accessibilityLabel={`Stage ${cfg.stage} of 5: ${problem ? PROBLEM_LABEL[problem] : cfg.label}`}>
      <View style={s.dots}>
        {[1, 2, 3, 4, 5].map((d) => (
          <View
            key={d}
            style={[
              s.dot,
              d < cfg.stage && { backgroundColor: theme.c.success },
              d === cfg.stage && { backgroundColor: color },
            ]}
          />
        ))}
      </View>
      <Text style={[s.label, { color }]}>{problem ? PROBLEM_LABEL[problem] : cfg.label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 4 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.creamDark, borderWidth: 1, borderColor: t.c.border },
  label: { fontFamily: t.fonts.monoBold, fontSize: 9.5, letterSpacing: 0.8 },
}));
