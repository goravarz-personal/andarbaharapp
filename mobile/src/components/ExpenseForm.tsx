import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, SegmentedControl, TextField } from './index';
import { formatMoney, parseRupees } from '../utils/money';
import { colors, font, radius, spacing } from '../theme';
import type { ExpenseCategory, ExpenseInput, SplitMode } from '../api/types';

export interface ExpensePerson {
  userId: string;
  displayName: string;
  avatarColor?: string | null;
}

/**
 * Captures one cost for the night. Used both when recording a new game and
 * when adding dinner to a game that already exists.
 */
export function ExpenseForm({
  players,
  onSubmit,
  submitLabel = 'Add expense',
  busy = false,
}: {
  players: ExpensePerson[];
  onSubmit: (input: ExpenseInput) => void;
  submitLabel?: string;
  busy?: boolean;
}) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('DINNER');
  const [splitMode, setSplitMode] = useState<SplitMode>('EQUAL');
  const [paidById, setPaidById] = useState<string | null>(players[0]?.userId ?? null);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const amountPaise = parseRupees(amount) ?? 0;

  const customTotal = useMemo(
    () =>
      players.reduce((total, person) => total + (parseRupees(shares[person.userId] ?? '') ?? 0), 0),
    [players, shares],
  );

  function submit() {
    setError(null);

    if (!label.trim()) return setError('Give the expense a name.');
    if (amountPaise <= 0) return setError('Enter how much it came to.');
    if (!paidById) return setError('Say who paid.');

    if (splitMode === 'CUSTOM' && customTotal !== amountPaise) {
      return setError(
        `The shares add up to ${formatMoney(customTotal)}, but the expense is ${formatMoney(amountPaise)}.`,
      );
    }

    onSubmit({
      label: label.trim(),
      amount: amountPaise,
      category,
      paidById,
      splitMode,
      shares:
        splitMode === 'CUSTOM'
          ? players
              .map((person) => ({
                userId: person.userId,
                amount: parseRupees(shares[person.userId] ?? '') ?? 0,
              }))
              .filter((share) => share.amount > 0)
          : undefined,
    });

    setLabel('');
    setAmount('');
    setShares({});
  }

  if (players.length === 0) {
    return (
      <Card>
        <Text style={styles.note}>Add players to the game first - someone has to pay the bill.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <SegmentedControl<ExpenseCategory>
        value={category}
        onChange={(next) => {
          setCategory(next);
          if (!label.trim()) setLabel(next === 'DINNER' ? 'Dinner' : '');
        }}
        options={[
          { value: 'DINNER', label: 'Dinner' },
          { value: 'OTHER', label: 'Other' },
        ]}
      />

      <View style={styles.gap} />

      <TextField
        label="What was it for"
        value={label}
        onChangeText={setLabel}
        placeholder={category === 'DINNER' ? 'Biryani and drinks' : 'Cards, cab, chips'}
      />

      <TextField
        label="Amount (₹)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      <Text style={styles.fieldLabel}>Who paid</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {players.map((person) => {
          const active = person.userId === paidById;
          return (
            <Pressable
              key={person.userId}
              onPress={() => setPaidById(person.userId)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {person.displayName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.fieldLabel}>How to split it</Text>
      <SegmentedControl<SplitMode>
        value={splitMode}
        onChange={setSplitMode}
        options={[
          { value: 'EQUAL', label: 'Equally' },
          { value: 'PAYER', label: 'My treat' },
          { value: 'CUSTOM', label: 'Custom' },
        ]}
      />
      <Text style={styles.hint}>
        {splitMode === 'EQUAL'
          ? 'Shared across everyone at the table, re-split automatically if someone joins later.'
          : splitMode === 'PAYER'
            ? 'Whoever paid covers the whole thing - nobody else chips in.'
            : 'Set each person’s share by hand. They have to add up to the total.'}
      </Text>

      {splitMode === 'CUSTOM' ? (
        <View style={styles.customBox}>
          {players.map((person) => (
            <View key={person.userId} style={styles.customRow}>
              <Text style={styles.customName} numberOfLines={1}>
                {person.displayName}
              </Text>
              <TextField
                label=""
                value={shares[person.userId] ?? ''}
                onChangeText={(next) =>
                  setShares((current) => ({ ...current, [person.userId]: next }))
                }
                keyboardType="decimal-pad"
                placeholder="0"
                style={styles.customInput}
              />
            </View>
          ))}
          <View style={styles.customTotalRow}>
            <Text style={styles.customTotalLabel}>Shares add up to</Text>
            <Text
              style={[
                styles.customTotalValue,
                customTotal !== amountPaise && styles.customTotalBad,
              ]}
            >
              {formatMoney(customTotal)} of {formatMoney(amountPaise)}
            </Text>
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label={submitLabel} onPress={submit} loading={busy} icon="add" />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { height: spacing(4) },
  fieldLabel: { ...font.smallStrong, color: colors.inkMuted, marginBottom: spacing(1.5) },
  chipRow: { marginBottom: spacing(4) },
  chip: {
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: spacing(2),
  },
  chipActive: { backgroundColor: colors.felt, borderColor: colors.felt },
  chipText: { ...font.smallStrong, color: colors.inkMuted },
  chipTextActive: { color: colors.white },

  hint: {
    ...font.small,
    color: colors.inkFaint,
    marginTop: spacing(2),
    marginBottom: spacing(4),
    lineHeight: 18,
  },

  customBox: {
    marginTop: spacing(4),
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing(3),
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  customName: { ...font.body, color: colors.ink, flex: 1 },
  customInput: { width: 110, marginBottom: spacing(2) },
  customTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    paddingTop: spacing(2),
    marginTop: spacing(1),
  },
  customTotalLabel: { ...font.small, color: colors.inkMuted },
  customTotalValue: { ...font.smallStrong, color: colors.win },
  customTotalBad: { color: colors.loss },

  error: { ...font.small, color: colors.loss, marginTop: spacing(3), marginBottom: spacing(2) },
  note: { ...font.small, color: colors.inkMuted, lineHeight: 20 },
});
