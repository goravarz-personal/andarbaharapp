import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, TextField } from './index';
import { Select, type SelectOption } from './Select';
import { formatMoney, parseRupees } from '../utils/money';
import { colors, font, radius, spacing } from '../theme';
import { EXPENSE_TYPES, EXPENSE_TYPE_LABELS, type ExpenseInput, type ExpenseType } from '../api/types';

export interface ExpensePerson {
  userId: string;
  displayName: string;
  avatarColor?: string | null;
  /** Won the most at the table. Dinner is theirs.  */
  isTopWinner?: boolean;
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
 * Captures one thing the night cost, and who went out and bought it.
 *
 * Dinner is the default. Several people order food over an evening, so each
 * round is recorded against whoever paid for it - they all add up to the one
 * dinner bill, which lands on whoever won the most. Anything else is carried by
 * whoever says they will, split evenly between them.
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
  const topWinner = players.find((person) => person.isTopWinner) ?? null;

  const [type, setType] = useState<ExpenseType>('DINNER');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [paidById, setPaidById] = useState<string | null>(null);
  const [bearers, setBearers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isDinner = type === 'DINNER';
  const amountPaise = parseRupees(amount) ?? 0;

  function toggleBearer(userId: string) {
    setBearers((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  function submit() {
    setError(null);
    if (amountPaise <= 0) return setError('Enter how much it came to.');
    // Somebody has to have handed over the money for dinner - that is the whole
    // point of recording it, since the top winner settles up with them.
    if (isDinner && !paidById) return setError('Say who bought it.');
    if (!isDinner && bearers.length === 0) return setError('Pick who is covering this one.');

    onSubmit({
      type,
      amount: amountPaise,
      label: label.trim() || undefined,
      paidById: paidById ?? undefined,
      shareUserIds: isDinner ? undefined : bearers,
    });

    setAmount('');
    setLabel('');
    setPaidById(null);
    setBearers([]);
  }

  if (players.length === 0) {
    return (
      <Card>
        <Text style={styles.note}>
          Add players to the game first — somebody has to have paid for it.
        </Text>
      </Card>
    );
  }

  const each = bearers.length > 0 ? Math.floor(amountPaise / bearers.length) : 0;

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

      <Text style={styles.fieldLabel}>{isDinner ? 'Who bought it' : 'Who paid for it'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {players.map((person) => {
          const active = person.userId === paidById;
          return (
            <Pressable
              key={person.userId}
              onPress={() => setPaidById(active ? null : person.userId)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              {active ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {person.displayName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.splitHint}>
        {isDinner
          ? 'Whoever handed over the money. Add a row for each person who ordered food — they all add up to one dinner bill.'
          : 'Optional. Who actually paid, if it is worth remembering.'}
      </Text>

      {isDinner ? (
        <View style={styles.onWinner}>
          <Ionicons name="trophy" size={16} color={colors.gold} />
          <Text style={styles.onWinnerText}>
            {topWinner ? (
              <>
                Dinner is on <Text style={styles.strong}>{topWinner.displayName}</Text>, who won the
                most. Correct someone&apos;s cash-out and the bill follows.
              </>
            ) : (
              'Dinner goes to whoever wins the most. Add it now — once the cash-outs are in, it lands on the right person by itself.'
            )}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Who is covering it</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {players.map((person) => {
              const active = bearers.includes(person.userId);
              return (
                <Pressable
                  key={person.userId}
                  onPress={() => toggleBearer(person.userId)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  {active ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {person.displayName}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.splitHint}>
            {bearers.length === 0
              ? 'Tap one person, or several to split it between them.'
              : bearers.length === 1
                ? 'All of it on them.'
                : `Split ${bearers.length} ways — about ${formatMoney(each)} each.`}
          </Text>
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
  chipRow: { marginBottom: spacing(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
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
  splitHint: { ...font.small, color: colors.inkFaint, marginBottom: spacing(4), lineHeight: 18 },

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
