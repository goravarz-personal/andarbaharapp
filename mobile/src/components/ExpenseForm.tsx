import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, TextField } from './index';
import { Select, type SelectOption } from './Select';
import { parseRupees } from '../utils/money';
import { colors, font, radius, spacing } from '../theme';
import { EXPENSE_TYPES, EXPENSE_TYPE_LABELS, type ExpenseInput, type ExpenseType } from '../api/types';

export interface ExpensePerson {
  userId: string;
  displayName: string;
  avatarColor?: string | null;
  isWinner?: boolean;
}

const TYPE_ICONS: Record<ExpenseType, keyof typeof Ionicons.glyphMap> = {
  DINNER: 'restaurant-outline',
  DRINKS: 'wine-outline',
  SNACKS: 'fast-food-outline',
  CARDS: 'albums-outline',
  VENUE: 'home-outline',
  TRAVEL: 'car-outline',
  OTHER: 'receipt-outline',
};

const TYPE_OPTIONS: Array<SelectOption<ExpenseType>> = EXPENSE_TYPES.map((type) => ({
  value: type,
  label: EXPENSE_TYPE_LABELS[type],
  icon: TYPE_ICONS[type],
}));

/**
 * Captures one cost for the night.
 *
 * Dinner is the default, and dinner is always on the winner - so for that type
 * there is nothing to choose and nothing to get wrong. Anything else needs a
 * payer named.
 */
export function ExpenseForm({
  players,
  onSubmit,
  submitLabel = 'Add',
  busy = false,
}: {
  players: ExpensePerson[];
  onSubmit: (input: ExpenseInput) => void;
  submitLabel?: string;
  busy?: boolean;
}) {
  const winner = players.find((person) => person.isWinner) ?? null;

  const [type, setType] = useState<ExpenseType>('DINNER');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [paidById, setPaidById] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDinner = type === 'DINNER';
  const amountPaise = parseRupees(amount) ?? 0;

  function submit() {
    setError(null);

    if (amountPaise <= 0) return setError('Enter how much it came to.');
    if (isDinner && !winner) {
      return setError('Mark who won first — dinner is always on the winner.');
    }
    if (!isDinner && !paidById) return setError('Say who paid.');

    onSubmit({
      type,
      amount: amountPaise,
      label: label.trim() || undefined,
      // Dinner is resolved by the server from whoever won.
      paidById: isDinner ? undefined : (paidById ?? undefined),
    });

    setAmount('');
    setLabel('');
  }

  if (players.length === 0) {
    return (
      <Card>
        <Text style={styles.note}>Add players to the game first — someone has to pay the bill.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Select<ExpenseType>
        label="What was it for"
        value={type}
        options={TYPE_OPTIONS}
        onChange={setType}
      />

      <TextField
        label="Amount (₹)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      {isDinner ? (
        <View style={styles.onWinner}>
          <Ionicons name="trophy" size={16} color={colors.gold} />
          <Text style={styles.onWinnerText}>
            {winner ? (
              <>
                Dinner is on <Text style={styles.strong}>{winner.displayName}</Text>, who won the
                night.
              </>
            ) : (
              'Nobody is marked as the winner yet. Dinner is always on the winner, so mark them first.'
            )}
          </Text>
        </View>
      ) : (
        <>
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
        </>
      )}

      <TextField
        label="Note (optional)"
        value={label}
        onChangeText={setLabel}
        placeholder={isDinner ? 'Biryani from the usual place' : 'Anything worth remembering'}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label={submitLabel} onPress={submit} loading={busy} icon="add" />
    </Card>
  );
}

const styles = StyleSheet.create({
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

  onWinner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(2.5),
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing(3.5),
    marginBottom: spacing(4),
  },
  onWinnerText: { ...font.small, color: colors.inkMuted, flex: 1, lineHeight: 19 },
  strong: { ...font.smallStrong, color: colors.ink },

  error: { ...font.small, color: colors.loss, marginTop: spacing(1), marginBottom: spacing(3) },
  note: { ...font.small, color: colors.inkMuted, lineHeight: 20 },
});
