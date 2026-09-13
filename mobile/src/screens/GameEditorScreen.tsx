import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorNotice,
  LoadingView,
  Money,
  SectionHeader,
  TextField,
} from '../components';
import { ExpenseForm } from '../components/ExpenseForm';
import { useAuth } from '../state/AuthContext';
import { formatMoney, parseRupees, toRupeeInput } from '../utils/money';
import { fromDateInput, formatDate, shiftDays, toDateInput, todayInput } from '../utils/date';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { confirm, notify } from '../utils/dialog';
import { EXPENSE_TYPE_LABELS, type ExpenseInput, type Game, type Player } from '../api/types';

interface SeatDraft {
  userId: string;
  displayName: string;
  avatarColor: string | null;
  /** Existing seat id, when editing a game that already has this player. */
  seatId?: string;
  /** Chips bought from the banker. */
  buyIn: string;
  /** Chips cashed back in, before the night's costs come off. */
  cashOut: string;
  isBanker: boolean;
}

const DEFAULT_LOCATION = 'Katte Room';

/** "Saturday-Regular" - what the nights are actually called. */
function defaultTitleFor(dateInput: string): string {
  const iso = fromDateInput(dateInput);
  if (!iso) return '';
  const day = new Date(iso).toLocaleDateString('en-GB', { weekday: 'long' });
  return `${day}-Regular`;
}

/**
 * Records a game night: who sat down, what they put in, what they took out,
 * who won, and what the night cost. Doubles as the edit screen.
 */
export function GameEditorScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'GameEditor'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api } = useAuth();
  const gameId = route.params?.gameId;
  const isEditing = Boolean(gameId);

  const [roster, setRoster] = useState<Player[]>([]);
  const [seats, setSeats] = useState<SeatDraft[]>([]);
  const [originalSeats, setOriginalSeats] = useState<SeatDraft[]>([]);
  const [expenses, setExpenses] = useState<ExpenseInput[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const [playedOn, setPlayedOn] = useState(todayInput());
  const [title, setTitle] = useState(() => defaultTitleFor(todayInput()));
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [notes, setNotes] = useState('');
  /** Once the name has been typed over, stop following the date. */
  const [titleEdited, setTitleEdited] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit game' : 'Record a game' });
  }, [navigation, isEditing]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [{ players }, existing] = await Promise.all([
        api.players(),
        gameId ? api.game(gameId) : Promise.resolve(null),
      ]);
      setRoster(players);

      if (existing) {
        const game: Game = existing.game;
        setPlayedOn(toDateInput(game.playedOn));
        setTitle(game.title ?? '');
        setLocation(game.location ?? '');
        setNotes(game.notes ?? '');
        setTitleEdited(true);
        const drafts: SeatDraft[] = game.players.map((seat) => ({
          userId: seat.userId,
          displayName: seat.displayName,
          avatarColor: seat.avatarColor,
          seatId: seat.id,
          buyIn: toRupeeInput(seat.buyIn),
          cashOut: toRupeeInput(seat.cashOut),
          isBanker: seat.isBanker,
        }));
        setSeats(drafts);
        setOriginalSeats(drafts);
      }
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [api, gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  const seated = useMemo(() => new Set(seats.map((seat) => seat.userId)), [seats]);
  const available = roster.filter((player) => !seated.has(player.id) && player.isActive);

  /**
   * The same arithmetic the server does, run as you type so the numbers on
   * screen are the numbers that will be saved.
   *
   * Chips come from the banker and go back to the banker, so the cash-ins and
   * cash-outs have to match. The night's costs then come off the people
   * carrying them - dinner off whoever won the most.
   */
  const ledger = useMemo(() => {
    const rows = seats.map((seat) => ({
      seat,
      buyIn: parseRupees(seat.buyIn) ?? 0,
      cashOut: parseRupees(seat.cashOut) ?? 0,
    }));

    const withNet = rows.map((row) => ({ ...row, tableNet: row.cashOut - row.buyIn }));
    const top = withNet.reduce<(typeof withNet)[number] | null>((best, row) => {
      if (!best) return row;
      if (row.tableNet !== best.tableNet) return row.tableNet > best.tableNet ? row : best;
      return row.cashOut > best.cashOut ? row : best;
    }, null);

    const shareByUser = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.type === 'DINNER') {
        if (top) {
          shareByUser.set(
            top.seat.userId,
            (shareByUser.get(top.seat.userId) ?? 0) + expense.amount,
          );
        }
        continue;
      }
      const bearers = expense.shareUserIds ?? [];
      if (bearers.length === 0) continue;
      const base = Math.floor(expense.amount / bearers.length);
      const remainder = expense.amount - base * bearers.length;
      bearers.forEach((userId, index) => {
        shareByUser.set(
          userId,
          (shareByUser.get(userId) ?? 0) + base + (index < remainder ? 1 : 0),
        );
      });
    }

    const byUser = new Map(
      withNet.map((row) => {
        const expenseShare = shareByUser.get(row.seat.userId) ?? 0;
        return [row.seat.userId, { ...row, expenseShare, net: row.tableNet - expenseShare }];
      }),
    );

    const buyIn = rows.reduce((sum, row) => sum + row.buyIn, 0);
    const cashOut = rows.reduce((sum, row) => sum + row.cashOut, 0);
    const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
      byUser,
      topWinner: top ? { userId: top.seat.userId, displayName: top.seat.displayName } : null,
      totals: { buyIn, cashOut, spent, difference: buyIn - cashOut },
    };
  }, [seats, expenses]);

  const totals = ledger.totals;
  const topWinner = ledger.topWinner;
  const netOf = (seat: SeatDraft) =>
    ledger.byUser.get(seat.userId) ?? { net: 0, expenseShare: 0, tableNet: 0 };

  function addSeat(player: Player) {
    setSeats((current) => [
      ...current,
      {
        userId: player.id,
        displayName: player.displayName,
        avatarColor: player.avatarColor,
        buyIn: '',
        cashOut: '',
        isBanker: false,
      },
    ]);
  }

  function updateSeat(userId: string, patch: Partial<SeatDraft>) {
    setSeats((current) =>
      current.map((seat) => (seat.userId === userId ? { ...seat, ...patch } : seat)),
    );
  }

  /** One banker a night - somebody has to be holding the cash. */
  function setBanker(userId: string) {
    setSeats((current) =>
      current.map((seat) => ({
        ...seat,
        isBanker: seat.userId === userId ? !seat.isBanker : false,
      })),
    );
  }

  /** Following the date, unless the name has been typed over. */
  function pickDate(next: string) {
    setPlayedOn(next);
    if (!titleEdited) setTitle(defaultTitleFor(next));
  }

  function removeSeat(userId: string) {
    setSeats((current) => current.filter((seat) => seat.userId !== userId));
  }

  async function save() {
    setError(null);

    const when = fromDateInput(playedOn);
    if (!when) return setError('Enter the date as YYYY-MM-DD.');
    if (seats.length === 0) return setError('Add at least one player.');

    for (const seat of seats) {
      if (parseRupees(seat.buyIn) === null || parseRupees(seat.cashOut) === null) {
        return setError(`Check the amounts for ${seat.displayName}.`);
      }
    }

    setSaving(true);
    try {
      if (isEditing && gameId) {
        await api.updateGame(gameId, {
          playedOn: when,
          title: title.trim(),
          location: location.trim(),
          notes: notes.trim(),
        });

        // Seats that were dropped have to go before the rest is saved, so a
        // player who paid for something is not silently left behind.
        const removed = originalSeats.filter((original) => !seated.has(original.userId));
        for (const seat of removed) {
          if (seat.seatId) await api.removeGamePlayer(gameId, seat.seatId);
        }
        for (const seat of seats) {
          await api.upsertGamePlayer(gameId, {
            userId: seat.userId,
            buyIn: parseRupees(seat.buyIn) ?? 0,
            cashOut: parseRupees(seat.cashOut) ?? 0,
            isBanker: seat.isBanker,
          });
        }
        navigation.goBack();
        return;
      }

      const { game } = await api.createGame({
        playedOn: when,
        title: title.trim() || undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        players: seats.map((seat) => ({
          userId: seat.userId,
          buyIn: parseRupees(seat.buyIn) ?? 0,
          cashOut: parseRupees(seat.cashOut) ?? 0,
          isBanker: seat.isBanker,
        })),
        expenses,
      });

      navigation.replace('GameDetail', { gameId: game.id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the game.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingView />;
  if (loadError) return <Screen><ErrorNotice message={loadError} onRetry={() => void load()} /></Screen>;

  return (
    <Screen
      footer={
        <Button
          label={isEditing ? 'Save changes' : 'Record this game'}
          onPress={save}
          loading={saving}
        />
      }
    >
      <Card>
        <TextField
          label="Date played"
          value={playedOn}
          onChangeText={pickDate}
          placeholder={todayInput()}
          autoCapitalize="none"
          hint={
            fromDateInput(playedOn)
              ? formatDate(fromDateInput(playedOn) as string)
              : 'Type it as YYYY-MM-DD'
          }
        />
        {/* Most games get recorded the same night or the morning after. */}
        <View style={styles.quickDates}>
          {[
            { label: 'Today', value: todayInput() },
            { label: 'Yesterday', value: shiftDays(todayInput(), -1) },
            { label: '2 days ago', value: shiftDays(todayInput(), -2) },
          ].map((option) => (
            <Pressable
              key={option.label}
              onPress={() => pickDate(option.value)}
              style={[styles.quickDate, playedOn === option.value && styles.quickDateOn]}
            >
              <Text
                style={[
                  styles.quickDateText,
                  playedOn === option.value && styles.quickDateTextOn,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextField
          label="Name this night"
          value={title}
          onChangeText={(next) => {
            setTitleEdited(true);
            setTitle(next);
          }}
          placeholder={defaultTitleFor(playedOn)}
        />
        <TextField
          label="Where"
          value={location}
          onChangeText={setLocation}
          placeholder={DEFAULT_LOCATION}
        />
      </Card>

      <SectionHeader title={`At the table (${seats.length})`} />

      {seats.length === 0 ? (
        <Card>
          <Text style={styles.muted}>Nobody added yet. Pick players from the list below.</Text>
        </Card>
      ) : (
        <View style={styles.seats}>
          {seats.map((seat) => (
            <Card key={seat.userId} style={styles.seatCard}>
              <View style={styles.seatHead}>
                <Avatar name={seat.displayName} color={seat.avatarColor} size={32} />
                <Text style={styles.seatName} numberOfLines={1}>
                  {seat.displayName}
                </Text>
                <Pressable
                  onPress={() => setBanker(seat.userId)}
                  hitSlop={8}
                  style={[styles.bankerButton, seat.isBanker && styles.bankerButtonOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${seat.displayName} as the banker`}
                  accessibilityState={{ selected: seat.isBanker }}
                >
                  <Ionicons
                    name={seat.isBanker ? 'wallet' : 'wallet-outline'}
                    size={15}
                    color={seat.isBanker ? colors.white : colors.inkFaint}
                  />
                </Pressable>
                <Pressable onPress={() => removeSeat(seat.userId)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
                </Pressable>
              </View>

              <View style={styles.amounts}>
                <TextField
                  label="Cash-in (₹)"
                  value={seat.buyIn}
                  onChangeText={(next) => updateSeat(seat.userId, { buyIn: next })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  style={styles.amountField}
                />
                <TextField
                  label="Cash-out (₹)"
                  value={seat.cashOut}
                  onChangeText={(next) => updateSeat(seat.userId, { cashOut: next })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  style={styles.amountField}
                />
              </View>

              {/* Worked out as you type, so nobody has to do it in their head. */}
              <View style={styles.seatFooter}>
                {seat.isBanker ? <Badge label="Banker" tone="felt" icon="wallet" /> : <View />}
                <View style={styles.seatNet}>
                  {netOf(seat).expenseShare > 0 ? (
                    <Text style={styles.seatNetNote}>
                      less {formatMoney(netOf(seat).expenseShare)}
                    </Text>
                  ) : null}
                  <Text style={styles.seatNetLabel}>Net</Text>
                  <Money value={netOf(seat).net} signed size="body" />
                </View>
              </View>
            </Card>
          ))}

          {/* Running check that the chips add up before anything is saved. */}
          <Card style={styles.tallyCard}>
            <View style={styles.tallyRow}>
              <Text style={styles.tallyLabel}>Chips bought</Text>
              <Text style={styles.tallyValue}>{formatMoney(totals.buyIn)}</Text>
            </View>
            <View style={styles.tallyRow}>
              <Text style={styles.tallyLabel}>Chips cashed back in</Text>
              <Text style={styles.tallyValue}>{formatMoney(totals.cashOut)}</Text>
            </View>
            <View style={[styles.tallyRow, styles.tallyTotal]}>
              <Text style={styles.tallyLabel}>
                {totals.difference === 0 ? 'Chips add up' : 'Out by'}
              </Text>
              {totals.difference === 0 ? (
                <Badge label="Balanced" tone="win" icon="checkmark-circle" />
              ) : (
                <Text style={styles.tallyBad}>{formatMoney(Math.abs(totals.difference))}</Text>
              )}
            </View>
            {topWinner ? (
              <View style={styles.tallyRow}>
                <Text style={styles.tallyLabel}>Dinner is on</Text>
                <Text style={styles.tallyValue}>{topWinner.displayName}</Text>
              </View>
            ) : null}
          </Card>
        </View>
      )}

      {available.length > 0 ? (
        <>
          <SectionHeader
            title="Add a player"
            action="New player"
            onAction={() => navigation.navigate('AddPlayer')}
          />
          <View style={styles.pickRow}>
            {available.map((player) => (
              <Pressable
                key={player.id}
                onPress={() => addSeat(player)}
                style={({ pressed }) => [styles.pick, pressed && styles.pickPressed]}
              >
                <Avatar name={player.displayName} color={player.avatarColor} size={24} />
                <Text style={styles.pickText}>{player.displayName}</Text>
                <Ionicons name="add" size={15} color={colors.felt} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {!isEditing ? (
        <>
          <SectionHeader
            title="What the night cost"
            action={showExpenseForm ? 'Close' : 'Add'}
            onAction={() => setShowExpenseForm((open) => !open)}
          />

          {expenses.length > 0 ? (
            <Card padded={false} style={styles.expenseList}>
              {expenses.map((expense, index) => {
                const carriers =
                  expense.type === 'DINNER'
                    ? topWinner
                      ? [topWinner.displayName]
                      : []
                    : (expense.shareUserIds ?? []).map(
                        (userId) =>
                          seats.find((seat) => seat.userId === userId)?.displayName ?? 'someone',
                      );
                return (
                  <View key={`${expense.type}-${index}`} style={styles.expenseRow}>
                    <View style={styles.expenseBody}>
                      <Text style={styles.expenseLabel}>
                        {EXPENSE_TYPE_LABELS[expense.type] ?? 'Cost'}
                      </Text>
                      <Text style={styles.expenseMeta} numberOfLines={1}>
                        {expense.label ? `${expense.label} · ` : ''}
                        {carriers.length > 0 ? carriers.join(' and ') : 'on the top winner'}
                      </Text>
                    </View>
                    <Text style={styles.expenseAmount}>{formatMoney(expense.amount)}</Text>
                    <Pressable
                      onPress={() =>
                        setExpenses((current) => current.filter((_, position) => position !== index))
                      }
                      hitSlop={10}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {showExpenseForm ? (
            <View style={styles.expenseForm}>
              <ExpenseForm
                players={seats.map((seat) => ({
                  ...seat,
                  isTopWinner: seat.userId === topWinner?.userId,
                }))}
                submitLabel="Add to this game"
                onSubmit={(input) => {
                  setExpenses((current) => [...current, input]);
                  setShowExpenseForm(false);
                }}
              />
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.editNote}>
          What the night cost is added from the game&apos;s own screen.
        </Text>
      )}

      <Card style={styles.notesCard}>
        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering about the night"
          multiline
        />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isEditing && gameId ? (
        <Button
          label="Delete this game"
          variant="danger"
          style={styles.deleteButton}
          onPress={() =>
            confirm({
              title: 'Delete this game?',
              message: 'This cannot be undone.',
              cancelLabel: 'Keep it',
              confirmLabel: 'Delete',
              destructive: true,
              onConfirm: async () => {
                try {
                  await api.deleteGame(gameId);
                  navigation.navigate('Tabs', { screen: 'Games' });
                } catch (caught) {
                  notify(
                    'Could not delete',
                    caught instanceof Error ? caught.message : 'Please try again.',
                  );
                }
              },
            })
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quickDates: {
    flexDirection: 'row',
    gap: spacing(2),
    marginTop: -spacing(2),
    marginBottom: spacing(4),
  },
  quickDate: {
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickDateOn: { backgroundColor: colors.felt, borderColor: colors.felt },
  quickDateText: { ...font.small, color: colors.inkMuted, fontWeight: '600' },
  quickDateTextOn: { color: colors.white },

  muted: { ...font.small, color: colors.inkMuted },
  seats: { gap: spacing(3) },
  seatCard: { gap: spacing(3) },
  seatHead: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  seatName: { ...font.bodyStrong, color: colors.ink, flex: 1 },
  bankerButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bankerButtonOn: { backgroundColor: colors.felt, borderColor: colors.felt },
  seatFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(2.5),
  },
  seatNet: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  seatNetNote: { ...font.small, color: colors.inkFaint, fontSize: 11 },
  seatNetLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10 },
  amounts: { flexDirection: 'row', gap: spacing(3) },
  amountField: { flex: 1, marginBottom: 0 },

  tallyCard: { gap: spacing(2), backgroundColor: colors.surfaceMuted },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tallyTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    paddingTop: spacing(2),
  },
  tallyLabel: { ...font.small, color: colors.inkMuted },
  tallyValue: { ...font.smallStrong, color: colors.ink },
  tallyBad: { ...font.smallStrong, color: colors.warn },

  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pickPressed: { opacity: 0.6 },
  pickText: { ...font.smallStrong, color: colors.ink },

  expenseList: { marginBottom: spacing(3) },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  expenseBody: { flex: 1 },
  expenseLabel: { ...font.bodyStrong, color: colors.ink },
  expenseMeta: { ...font.small, color: colors.inkMuted, marginTop: 1 },
  expenseAmount: { ...font.bodyStrong, color: colors.ink },
  expenseForm: { marginTop: spacing(1) },
  editNote: { ...font.small, color: colors.inkFaint, marginTop: spacing(5), lineHeight: 19 },

  notesCard: { marginTop: spacing(5) },
  error: { ...font.small, color: colors.loss, marginTop: spacing(3) },
  deleteButton: { marginTop: spacing(6) },
});
