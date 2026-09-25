/** Mobile stand-in for the desktop's <select className="select">: a field that opens a picker sheet. */
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/ThemeContext';
import { TOUCH } from '../theme/tokens';

export interface SelectOption { value: string; label: string }

export function SelectField({
  value, options, onChange, placeholder = 'Select', title, invalid, disabled,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  title: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${current?.label ?? placeholder}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[s.field, invalid && s.invalid, disabled && { opacity: 0.6 }]}
      >
        <Text style={[s.value, !current && s.placeholder]} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Text style={s.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}><Text style={s.close}>✕</Text></Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value || '__empty'}
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => { onChange(item.value); setOpen(false); }}
                  style={[s.option, active && s.optionActive]}
                >
                  <Text style={[s.optionText, active && s.optionTextActive]}>{item.label}</Text>
                  {active ? <Text style={s.optionTextActive}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  field: {
    minHeight: TOUCH,
    backgroundColor: t.c.creamDark,
    borderWidth: 1,
    borderColor: t.c.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  invalid: { borderColor: t.c.danger, borderWidth: 1.5 },
  value: { flex: 1, fontFamily: t.fonts.body, fontSize: t.fontSize.body, color: t.c.text },
  placeholder: { color: t.c.textMuted },
  chevron: { color: t.c.crimson, fontSize: 14, marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: t.c.overlay },
  sheet: { maxHeight: '70%', backgroundColor: t.c.surface, borderTopWidth: 3, borderTopColor: t.c.crimson },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.c.border,
  },
  sheetTitle: { fontFamily: t.fonts.monoBold, fontSize: t.fontSize.mono, letterSpacing: 1.4, textTransform: 'uppercase', color: t.c.text },
  close: { fontFamily: t.fonts.monoBold, fontSize: 16, color: t.c.crimson },
  option: {
    minHeight: TOUCH,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: t.c.grid,
  },
  optionActive: { backgroundColor: 'rgba(196, 43, 43, 0.08)' },
  optionText: { fontFamily: t.fonts.body, fontSize: t.fontSize.body, color: t.c.text },
  optionTextActive: { fontFamily: t.fonts.semibold, color: t.c.crimson },
}));
