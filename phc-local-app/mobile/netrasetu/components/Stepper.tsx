/** The capture screen's .cs-stepper: 1. CAPTURE · 2. QUALITY GATE · 3. METADATA & SYNC. */
import React from 'react';
import { Text, View } from 'react-native';
import { makeStyles } from '../theme/ThemeContext';

export function Stepper({ steps, active }: { steps: string[]; active: number }) {
  const s = useStyles();
  return (
    <View style={s.row} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: steps.length, now: active }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const isActive = n === active;
        const done = n < active;
        return (
          <View key={label} style={[s.step, isActive && s.active, i === steps.length - 1 && { borderRightWidth: 0 }]}>
            <Text style={[s.text, isActive && s.textActive, done && s.textDone]} numberOfLines={2}>
              {label}{done ? ' ✓' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', borderWidth: 1, borderColor: t.c.border },
  step: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: t.c.creamLight,
    borderRightWidth: 1,
    borderRightColor: t.c.border,
    justifyContent: 'center',
  },
  active: { backgroundColor: t.c.crimson },
  text: {
    fontFamily: t.fonts.monoBold,
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: t.c.textMuted,
  },
  textActive: { color: '#FFFFFF' },
  textDone: { color: t.c.crimson, fontFamily: t.fonts.monoHeavy },
}));
