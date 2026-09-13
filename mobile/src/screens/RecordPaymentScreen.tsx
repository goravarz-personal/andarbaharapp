import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar, Button, Card, LoadingView, TextField } from '../components';
import { useAuth } from '../state/AuthContext';
import { parseRupees } from '../utils/money';
import { colors, font, radius, spacing } from '../theme';
import type { Player } from '../api/types';

/**
 * An IOU recorded by hand - a loan at the table, a shared cab, anything that
 * did not come out of a game's own maths.
 */
export function RecordPaymentScreen() {
  const { api } = useAuth();
  const navigation = useNavigation();

  const [players, setPlayers] = useState<Player[] | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { players: roster } = await api.players();
        setPlayers(roster);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load the roster.');
        setPlayers([]);
      }
    })();
  }, [api]);

  async function submit() {
    setError(null);
    const paise = parseRupees(amount);

    if (!fromId) return setError('Pick who owes the money.');
    if (!toId) return setError('Pick who is being paid.');
    if (fromId === toId) return setError('A player cannot owe themselves.');
    if (!paise || paise <= 0) return setError('Enter how much is owed.');

    setBusy(true);
    try {
      await api.createSettlement({
        fromUserId: fromId,
        toUserId: toId,
        amount: paise,
        note: note.trim() || undefined,
      });
      navigation.goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record it.');
    } finally {
      setBusy(false);
    }
  }

  if (!players) return <LoadingView />;

  return (
    <Screen footer={<Button label="Record it" onPress={submit} loading={busy} />}>
      <Card>
        <Text style={styles.label}>Who owes</Text>
        <PersonRow players={players} selected={fromId} onSelect={setFromId} />

        <View style={styles.arrow}>
          <Ionicons name="arrow-down" size={18} color={colors.inkFaint} />
        </View>

        <Text style={styles.label}>Who gets paid</Text>
        <PersonRow players={players} selected={toId} onSelect={setToId} />

        <View style={styles.gap} />

        <TextField
          label="Amount (₹)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <TextField
          label="What for (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Cab home, chips loan…"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      <Text style={styles.footnote}>
        This sits alongside the payments worked out from games. It clears when the player being
        paid confirms they got the money.
      </Text>
    </Screen>
  );
}

function PersonRow({
  players,
  selected,
  onSelect,
}: {
  players: Player[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
      {players.map((player) => {
        const active = player.id === selected;
        return (
          <Pressable
            key={player.id}
            onPress={() => onSelect(player.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Avatar name={player.displayName} color={player.avatarColor} size={22} />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {player.displayName}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { ...font.smallStrong, color: colors.inkMuted, marginBottom: spacing(2) },
  row: { marginBottom: spacing(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: spacing(2),
  },
  chipActive: { backgroundColor: colors.felt, borderColor: colors.felt },
  chipText: { ...font.smallStrong, color: colors.inkMuted },
  chipTextActive: { color: colors.white },
  arrow: { alignItems: 'center', paddingVertical: spacing(2) },
  gap: { height: spacing(3) },
  error: { ...font.small, color: colors.loss, marginTop: spacing(1) },
  footnote: {
    ...font.small,
    color: colors.inkFaint,
    marginTop: spacing(5),
    lineHeight: 18,
    textAlign: 'center',
  },
});
