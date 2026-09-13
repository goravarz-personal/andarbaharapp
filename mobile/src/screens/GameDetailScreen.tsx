import React, { useState } from 'react';
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
} from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from '../utils/money';
import { formatDate, formatDateLong } from '../utils/date';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { confirm, notify } from '../utils/dialog';
import type { Game } from '../api/types';

export function GameDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'GameDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, isAdmin, user } = useAuth();
  const { gameId } = route.params;

  const [busy, setBusy] = useState(false);
  const { data, loading, error, refreshing, refetch, setData } = useApiQuery<{ game: Game }>(
    (client) => client.game(gameId),
    [gameId],
  );

  const game = data?.game;

  // Put the night's own name in the header rather than a generic "Game".
  React.useEffect(() => {
    if (game) navigation.setOptions({ title: game.title ?? formatDate(game.playedOn) });
  }, [navigation, game]);

  async function settle(force = false) {
    if (!game) return;
    setBusy(true);
    try {
      const response = await api.settleGame(game.id, force);
      setData(response);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not settle the game.';
      // The API refuses to wipe payments already marked paid without a nudge.
      if (!force && message.includes('force=true')) {
        confirm({
          title: 'Some payments are already marked paid',
          message,
          confirmLabel: 'Settle again',
          destructive: true,
          onConfirm: () => void settle(true),
        });
      } else {
        notify('Could not settle', message);
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!game) return;
    confirm({
      title: 'Delete this game?',
      message:
        'The players, expenses and payments recorded for this night go with it. This cannot be undone.',
      cancelLabel: 'Keep it',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.deleteGame(game.id);
          navigation.goBack();
        } catch (caught) {
          notify('Could not delete', caught instanceof Error ? caught.message : 'Please try again.');
        }
      },
    });
  }

  async function removeExpense(expenseId: string) {
    if (!game) return;
    try {
      setData(await api.deleteExpense(game.id, expenseId));
    } catch (caught) {
      notify('Could not remove', caught instanceof Error ? caught.message : 'Please try again.');
    }
  }

  if (loading && !game) return <LoadingView />;
  if (error && !game) return <Screen><ErrorNotice message={error} onRetry={refetch} /></Screen>;
  if (!game) return null;

  const ranked = [...game.players].sort((a, b) => b.net - a.net);

  return (
    <Screen
      onRefresh={refetch}
      refreshing={refreshing}
      footer={
        isAdmin ? (
          <Button
            label={game.status === 'SETTLED' ? 'Work out the split again' : 'Settle up'}
            icon="swap-horizontal"
            onPress={() => void settle(false)}
            loading={busy}
            variant={game.status === 'SETTLED' ? 'secondary' : 'primary'}
          />
        ) : undefined
      }
    >
      <Card style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{game.title ?? 'Game night'}</Text>
            <Text style={styles.date}>{formatDateLong(game.playedOn)}</Text>
            {game.location ? <Text style={styles.location}>{game.location}</Text> : null}
          </View>
          <Badge
            label={game.status === 'SETTLED' ? 'Settled' : 'Open'}
            tone={game.status === 'SETTLED' ? 'win' : 'neutral'}
          />
        </View>

        <View style={styles.totals}>
          <Total label="Pot" value={formatMoney(game.totals.buyIn)} />
          <Total label="Dinner" value={formatMoney(game.totals.dinner)} />
          <Total label="Other" value={formatMoney(game.totals.otherExpenses)} />
          <Total label="Players" value={String(game.playerCount)} />
        </View>

        {!game.balanced ? (
          <View style={styles.imbalance}>
            <Ionicons name="alert-circle" size={15} color={colors.warn} />
            <Text style={styles.imbalanceText}>
              Cash-outs are {formatMoney(Math.abs(game.totals.tableImbalance))}{' '}
              {game.totals.tableImbalance > 0 ? 'more' : 'less'} than the buy-ins. Check the numbers
              before settling.
            </Text>
          </View>
        ) : null}

        {game.notes ? <Text style={styles.notes}>{game.notes}</Text> : null}
      </Card>

      <SectionHeader
        title="At the table"
        action={isAdmin ? 'Edit' : undefined}
        onAction={isAdmin ? () => navigation.navigate('GameEditor', { gameId: game.id }) : undefined}
      />
      <Card padded={false}>
        <View style={styles.tableHead}>
          <Text style={[styles.headCell, styles.headName]}>Player</Text>
          <Text style={styles.headCell}>In</Text>
          <Text style={styles.headCell}>Out</Text>
          <Text style={[styles.headCell, styles.headNet]}>Net</Text>
        </View>
        {ranked.map((player, index) => (
          <Pressable
            key={player.id}
            onPress={() => navigation.navigate('PlayerDetail', { playerId: player.userId })}
            style={({ pressed }) => [
              styles.playerRowWrap,
              index < ranked.length - 1 && styles.divided,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.playerRow}>
              <View style={styles.playerName}>
                <Avatar name={player.displayName} color={player.avatarColor} size={30} />
                <Text
                  style={[styles.playerLabel, player.userId === user?.id && styles.playerIsMe]}
                  numberOfLines={1}
                >
                  {player.displayName}
                  {player.userId === user?.id ? ' (you)' : ''}
                </Text>
                {player.isWinner ? (
                  <Ionicons name="trophy" size={13} color={colors.gold} />
                ) : null}
              </View>
              <Text style={styles.cell}>{formatMoney(player.buyIn, { bare: true })}</Text>
              <Text style={styles.cell}>{formatMoney(player.cashOut, { bare: true })}</Text>
              <View style={styles.netCell}>
                <Money value={player.net} signed size="small" />
              </View>
            </View>

            {/* Why the net is not simply out minus in. Its own line, because it
                never fits beside four columns of numbers. */}
            {player.expenseShare > 0 || player.expensePaid > 0 ? (
              <Text style={styles.playerSub}>
                {[
                  player.expensePaid > 0 ? `paid ${formatMoney(player.expensePaid)} of expenses` : '',
                  player.expenseShare > 0 ? `share ${formatMoney(player.expenseShare)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </Card>

      <SectionHeader
        title="Dinner and expenses"
        action={isAdmin ? 'Add' : undefined}
        onAction={isAdmin ? () => navigation.navigate('AddExpense', { gameId: game.id }) : undefined}
      />
      {game.expenses.length === 0 ? (
        <Card>
          <Text style={styles.muted}>Nothing spent on this night.</Text>
        </Card>
      ) : (
        <Card padded={false}>
          {game.expenses.map((expense, index) => (
            <View
              key={expense.id}
              style={[styles.expenseRow, index < game.expenses.length - 1 && styles.divided]}
            >
              <View style={styles.expenseIcon}>
                <Ionicons
                  name={expense.category === 'DINNER' ? 'restaurant-outline' : 'receipt-outline'}
                  size={16}
                  color={colors.feltSoft}
                />
              </View>
              <View style={styles.expenseBody}>
                <Text style={styles.expenseLabel}>{expense.label}</Text>
                <Text style={styles.expenseMeta}>
                  {expense.paidBy.displayName} paid ·{' '}
                  {expense.splitMode === 'EQUAL'
                    ? 'split equally'
                    : expense.splitMode === 'PAYER'
                      ? 'their treat'
                      : 'custom split'}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>{formatMoney(expense.amount)}</Text>
              {isAdmin ? (
                <Pressable
                  onPress={() => removeExpense(expense.id)}
                  hitSlop={10}
                  style={styles.expenseDelete}
                >
                  <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title="Who pays whom" />
      {game.settlements.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            {game.status === 'SETTLED'
              ? 'Everyone came out even on this one.'
              : 'Not settled yet. Settling works out the fewest payments that clear the night.'}
          </Text>
        </Card>
      ) : (
        <Card padded={false}>
          {game.settlements.map((settlement, index) => (
            <View
              key={settlement.id}
              style={[styles.payRow, index < game.settlements.length - 1 && styles.divided]}
            >
              <Avatar name={settlement.from.displayName} color={settlement.from.avatarColor} size={28} />
              <View style={styles.payBody}>
                <Text style={styles.payText} numberOfLines={1}>
                  <Text style={styles.payName}>{settlement.from.displayName}</Text> pays{' '}
                  <Text style={styles.payName}>{settlement.to.displayName}</Text>
                </Text>
                <Text style={styles.payAmount}>{formatMoney(settlement.amount)}</Text>
              </View>
              <Badge
                label={settlement.status === 'PAID' ? 'Paid' : 'Pending'}
                tone={settlement.status === 'PAID' ? 'win' : 'warn'}
              />
            </View>
          ))}
        </Card>
      )}

      {isAdmin ? (
        <View style={styles.adminActions}>
          {game.status === 'SETTLED' ? (
            <Button
              label="Re-open this game"
              variant="ghost"
              onPress={async () => {
                try {
                  setData(await api.reopenGame(game.id));
                } catch (caught) {
                  notify(
                    'Could not re-open',
                    caught instanceof Error ? caught.message : 'Please try again.',
                  );
                }
              }}
            />
          ) : null}
          <Button label="Delete this game" variant="danger" onPress={confirmDelete} />
        </View>
      ) : null}
    </Screen>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing(4) },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) },
  headerText: { flex: 1 },
  title: { ...font.title, color: colors.ink },
  date: { ...font.small, color: colors.inkMuted, marginTop: 2 },
  location: { ...font.small, color: colors.inkFaint, marginTop: 1 },

  totals: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
  },
  total: { flex: 1 },
  totalLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10 },
  totalValue: { ...font.smallStrong, color: colors.ink, marginTop: 2 },

  imbalance: {
    flexDirection: 'row',
    gap: spacing(2),
    backgroundColor: colors.warnSoft,
    padding: spacing(3),
    borderRadius: radius.md,
  },
  imbalanceText: { ...font.small, color: colors.warn, flex: 1, lineHeight: 18 },
  notes: { ...font.small, color: colors.inkMuted, lineHeight: 20 },

  tableHead: {
    flexDirection: 'row',
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    paddingBottom: spacing(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headCell: { ...font.caption, color: colors.inkFaint, fontSize: 10, width: 52, textAlign: 'right' },
  headName: { flex: 1, textAlign: 'left' },
  headNet: { width: 70 },

  playerRowWrap: { paddingHorizontal: spacing(4), paddingVertical: spacing(3) },
  playerRow: { flexDirection: 'row', alignItems: 'center' },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pressed: { opacity: 0.6, backgroundColor: colors.surfaceMuted },
  playerName: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing(2) },
  playerLabel: { ...font.bodyStrong, color: colors.ink, flexShrink: 1 },
  playerIsMe: { color: colors.felt },
  playerSub: {
    ...font.small,
    color: colors.inkFaint,
    fontSize: 11,
    marginTop: spacing(1),
    marginLeft: 38,
  },
  cell: { ...font.small, color: colors.inkMuted, width: 52, textAlign: 'right' },
  netCell: { width: 70, alignItems: 'flex-end' },

  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    gap: spacing(3),
  },
  expenseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseBody: { flex: 1 },
  expenseLabel: { ...font.bodyStrong, color: colors.ink },
  expenseMeta: { ...font.small, color: colors.inkMuted, marginTop: 1 },
  expenseAmount: { ...font.bodyStrong, color: colors.ink },
  expenseDelete: { marginLeft: spacing(1) },

  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    gap: spacing(3),
  },
  payBody: { flex: 1 },
  payText: { ...font.small, color: colors.inkMuted },
  payName: { ...font.smallStrong, color: colors.ink },
  payAmount: { ...font.bodyStrong, color: colors.ink, marginTop: 1 },

  muted: { ...font.small, color: colors.inkMuted, lineHeight: 20 },
  adminActions: { marginTop: spacing(6), gap: spacing(2) },
});
