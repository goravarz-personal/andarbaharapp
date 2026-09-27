import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
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
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney, parseRupees } from '../utils/money';
import { formatTime, plural } from '../utils/date';
import { confirm, notify } from '../utils/dialog';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Game, GamePlayerLine } from '../api/types';

/**
 * One player's night: every trip to the banker, timed, and the one cash-out at
 * the end of it.
 *
 * Chips can be bought over and over - that is the normal shape of an evening -
 * so the buy-ins are a list rather than a single number. Cashing out closes the
 * seat, and undoing it opens it again if the number was wrong or they play on.
 */
export function SeatScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Seat'>>();
  const navigation = useNavigation();
  const { api, isAdmin } = useAuth();
  const { gameId, seatId } = route.params;

  const { data, loading, error, refreshing, refetch, setData } = useApiQuery<{ game: Game }>(
    (client) => client.game(gameId),
    [gameId],
  );

  const game = data?.game;
  const seat = game?.players.find((player) => player.id === seatId) ?? null;

  const [buyInAmount, setBuyInAmount] = useState('');
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [busy, setBusy] = useState<null | 'buyIn' | 'cashOut' | 'undo' | 'banker'>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (seat) navigation.setOptions({ title: seat.displayName });
  }, [navigation, seat]);

  /** Every change comes back with the whole game, so the screen stays honest. */
  async function run(kind: NonNullable<typeof busy>, work: () => Promise<{ game: Game }>) {
    setActionError(null);
    setBusy(kind);
    try {
      setData(await work());
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Please try again.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function addBuyIn() {
    const amount = parseRupees(buyInAmount);
    if (amount === null || amount <= 0) {
      setActionError('Enter how many chips they bought.');
      return;
    }
    if (await run('buyIn', () => api.addBuyIn(gameId, seatId, amount))) setBuyInAmount('');
  }

  async function cashOut() {
    // Cashing out for nothing is a real result, but leaving the box empty is
    // not - an empty field must not quietly record a zero.
    const amount = cashOutAmount.trim() === '' ? null : parseRupees(cashOutAmount);
    if (amount === null) {
      setActionError('Enter what they cashed out for. Type 0 if they lost the lot.');
      return;
    }
    if (await run('cashOut', () => api.cashOut(gameId, seatId, amount))) setCashOutAmount('');
  }

  if (loading && !game) return <LoadingView />;
  if (error && !game) {
    return (
      <Screen>
        <ErrorNotice message={error} onRetry={refetch} />
      </Screen>
    );
  }
  if (!game) return null;
  if (!seat) {
    return (
      <Screen>
        <ErrorNotice message="That player is no longer at this table." />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={refetch} refreshing={refreshing}>
      <Card style={styles.header}>
        <View style={styles.headerTop}>
          <Avatar name={seat.displayName} color={seat.avatarColor} size={44} />
          <View style={styles.headerText}>
            <Text style={styles.name}>{seat.displayName}</Text>
            <Text style={styles.joined}>Sat down at {formatTime(seat.joinedAt)}</Text>
          </View>
          {seat.isPlaying ? (
            <Badge label="Still in" tone="felt" icon="ellipse" />
          ) : seat.isTopWinner ? (
            <Badge label="Won most" tone="win" icon="trophy" />
          ) : null}
        </View>

        <View style={styles.figures}>
          <Figure label="Bought" value={formatMoney(seat.buyIn)} caption={buyInCaption(seat)} />
          <Figure
            label="Cashed out"
            value={seat.cashOut === null ? '—' : formatMoney(seat.cashOut)}
            caption={
              seat.cashedOutAt ? `at ${formatTime(seat.cashedOutAt)}` : 'still at the table'
            }
          />
        </View>

        {/* Net only means something once they have stood up. */}
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>
            {seat.net === null
              ? 'Net once they cash out'
              : seat.expenseShare > 0
                ? `Net, after ${formatMoney(seat.expenseShare)} of the night's costs`
                : 'Net'}
          </Text>
          {seat.net === null ? (
            <Text style={styles.netPending}>—</Text>
          ) : (
            <Money value={seat.net} signed size="heading" />
          )}
        </View>
      </Card>

      <SectionHeader title={`Trips to the banker (${seat.buyIns.length})`} />
      {seat.buyIns.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No chips bought yet.</Text>
        </Card>
      ) : (
        <Card padded={false}>
          {seat.buyIns.map((entry, index) => (
            <View
              key={entry.id}
              style={[styles.buyInRow, index < seat.buyIns.length - 1 && styles.divided]}
            >
              <View style={styles.buyInIcon}>
                <Text style={styles.buyInIndex}>{index + 1}</Text>
              </View>
              <View style={styles.buyInBody}>
                <Text style={styles.buyInAmount}>{formatMoney(entry.amount)}</Text>
                <Text style={styles.buyInTime}>{formatTime(entry.at)}</Text>
              </View>
              {isAdmin ? (
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove the ${formatMoney(entry.amount)} buy-in`}
                  onPress={() =>
                    confirm({
                      title: 'Remove this buy-in?',
                      message: `${formatMoney(entry.amount)} at ${formatTime(entry.at)}.`,
                      cancelLabel: 'Keep it',
                      confirmLabel: 'Remove',
                      destructive: true,
                      onConfirm: () =>
                        void run('buyIn', () => api.removeBuyIn(gameId, seatId, entry.id)),
                    })
                  }
                >
                  <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
          <View style={[styles.buyInRow, styles.buyInTotal]}>
            <View style={styles.buyInBody}>
              <Text style={styles.buyInTotalLabel}>{plural(seat.buyIns.length, 'buy-in')} in all</Text>
            </View>
            <Text style={styles.buyInAmount}>{formatMoney(seat.buyIn)}</Text>
          </View>
        </Card>
      )}

      {isAdmin && seat.isPlaying ? (
        <>
          <SectionHeader title="Another buy-in" />
          <Card>
            <View style={styles.inlineForm}>
              <TextField
                label="Chips bought (₹)"
                value={buyInAmount}
                onChangeText={setBuyInAmount}
                keyboardType="decimal-pad"
                placeholder="1000"
                style={styles.inlineField}
              />
              <Button
                label="Add"
                icon="add"
                onPress={addBuyIn}
                loading={busy === 'buyIn'}
                style={styles.inlineButton}
              />
            </View>
            <Text style={styles.formHint}>Recorded at the time you add it.</Text>
          </Card>

          <SectionHeader title="Cash out" />
          <Card>
            <View style={styles.inlineForm}>
              <TextField
                label="Chips cashed in (₹)"
                value={cashOutAmount}
                onChangeText={setCashOutAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                style={styles.inlineField}
              />
              <Button
                label="Cash out"
                onPress={cashOut}
                loading={busy === 'cashOut'}
                style={styles.inlineButton}
              />
            </View>
            <Text style={styles.formHint}>
              Everything they hand back to the banker, before the night&apos;s costs come off. This
              happens once — you can undo it if the number was wrong.
            </Text>
          </Card>
        </>
      ) : null}

      {isAdmin && !seat.isPlaying ? (
        <Card style={styles.closedCard}>
          <View style={styles.closedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.win} />
            <Text style={styles.closedText}>
              Cashed out for {formatMoney(seat.cashOut ?? 0)}
              {seat.cashedOutAt ? ` at ${formatTime(seat.cashedOutAt)}` : ''}.
            </Text>
          </View>
          <Button
            label="Undo the cash-out"
            variant="secondary"
            icon="arrow-undo-outline"
            loading={busy === 'undo'}
            onPress={() =>
              confirm({
                title: 'Undo the cash-out?',
                message: 'Their seat opens again and they can buy more chips.',
                cancelLabel: 'Leave it',
                confirmLabel: 'Undo',
                onConfirm: () => void run('undo', () => api.undoCashOut(gameId, seatId)),
              })
            }
          />
        </Card>
      ) : null}

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      {isAdmin ? (
        <>
          <SectionHeader title="This seat" />
          <Card>
            <Button
              label={seat.isBanker ? 'Not the banker tonight' : 'Make them the banker'}
              variant="secondary"
              icon={seat.isBanker ? 'wallet' : 'wallet-outline'}
              loading={busy === 'banker'}
              onPress={() =>
                void run('banker', () =>
                  api.updateGamePlayer(gameId, seatId, { isBanker: !seat.isBanker }),
                )
              }
            />
            <Text style={styles.formHint}>
              {seat.isBanker
                ? 'They are holding the cash tonight.'
                : 'Whoever sells the chips and pays out at the end.'}
            </Text>
            <Button
              label="Take them off this game"
              variant="danger"
              style={styles.removeButton}
              onPress={() =>
                confirm({
                  title: `Take ${seat.displayName} off this game?`,
                  message: 'Their buy-ins and cash-out for this night go with them.',
                  cancelLabel: 'Keep them',
                  confirmLabel: 'Remove',
                  destructive: true,
                  onConfirm: async () => {
                    try {
                      await api.removeGamePlayer(gameId, seatId);
                      navigation.goBack();
                    } catch (caught) {
                      notify(
                        'Could not remove',
                        caught instanceof Error ? caught.message : 'Please try again.',
                      );
                    }
                  },
                })
              }
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/** "3 trips" reads better than repeating the total underneath itself. */
function buyInCaption(seat: GamePlayerLine): string {
  if (seat.buyIns.length === 0) return 'nothing bought yet';
  if (seat.buyIns.length === 1) return 'one trip to the banker';
  return `over ${seat.buyIns.length} trips`;
}

function Figure({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.figureValue}>{value}</Text>
      {caption ? <Text style={styles.figureCaption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing(4) },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  headerText: { flex: 1 },
  name: { ...font.title, color: colors.ink },
  joined: { ...font.small, color: colors.inkMuted, marginTop: 2 },

  figures: {
    flexDirection: 'row',
    gap: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
  },
  figure: { flex: 1 },
  figureLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10 },
  figureValue: { ...font.heading, color: colors.ink, marginTop: 2 },
  figureCaption: { ...font.small, color: colors.inkFaint, fontSize: 11, marginTop: 1 },

  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
  },
  netLabel: { ...font.small, color: colors.inkMuted, flex: 1 },
  netPending: { ...font.heading, color: colors.inkFaint },

  muted: { ...font.small, color: colors.inkMuted },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  buyInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
  },
  buyInIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyInIndex: { ...font.caption, color: colors.inkMuted, fontSize: 11 },
  buyInBody: { flex: 1 },
  buyInAmount: { ...font.bodyStrong, color: colors.ink },
  buyInTime: { ...font.small, color: colors.inkFaint, fontSize: 11, marginTop: 1 },
  buyInTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  buyInTotalLabel: { ...font.small, color: colors.inkMuted },

  inlineForm: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(3) },
  inlineField: { flex: 1, marginBottom: 0 },
  inlineButton: { minWidth: 104 },
  formHint: { ...font.small, color: colors.inkFaint, marginTop: spacing(2.5), lineHeight: 18 },

  closedCard: { gap: spacing(3), marginTop: spacing(5) },
  closedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  closedText: { ...font.small, color: colors.inkMuted, flex: 1, lineHeight: 19 },

  removeButton: { marginTop: spacing(5) },
  error: { ...font.small, color: colors.loss, marginTop: spacing(3) },
});
