import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow, spacing } from '../theme';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * A drop-down. React Native has no native one, so this is a field that opens a
 * sheet of choices - which behaves the same on both platforms and reads better
 * on a phone than a cramped native picker wheel.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (next: T) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? 'choose'}`}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
      >
        {selected?.icon ? (
          <Ionicons name={selected.icon} size={17} color={colors.feltSoft} style={styles.fieldIcon} />
        ) : null}
        <Text style={styles.fieldText}>{selected?.label ?? 'Choose…'}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkFaint} />
      </Pressable>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Stops a tap inside the sheet from closing it. */}
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={styles.sheetScroll} bounces={false}>
              {options.map((option, index) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      index < options.length - 1 && styles.optionDivided,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    {option.icon ? (
                      <Ionicons
                        name={option.icon}
                        size={18}
                        color={active ? colors.felt : colors.inkFaint}
                      />
                    ) : null}
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {option.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.felt} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing(4) },
  label: { ...font.smallStrong, color: colors.inkMuted, marginBottom: spacing(1.5) },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    minHeight: 48,
    paddingHorizontal: spacing(3.5),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
  },
  fieldPressed: { opacity: 0.65 },
  fieldIcon: { marginRight: -spacing(0.5) },
  fieldText: { flex: 1, fontSize: 16, color: colors.ink },
  hint: { ...font.small, color: colors.inkFaint, marginTop: spacing(1), lineHeight: 18 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 61, 46, 0.45)',
    justifyContent: 'center',
    padding: spacing(6),
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing(2),
    maxHeight: '70%',
    ...shadow.raised,
  },
  sheetTitle: {
    ...font.caption,
    color: colors.inkFaint,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(2),
    paddingBottom: spacing(1),
  },
  sheetScroll: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
  },
  optionDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  optionPressed: { backgroundColor: colors.surfaceMuted },
  optionText: { flex: 1, fontSize: 16, color: colors.ink },
  optionTextActive: { color: colors.felt, fontWeight: '600' },
});
