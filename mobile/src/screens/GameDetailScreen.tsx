import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar, Badge, Button, Card, ErrorNotice, LoadingView, Money, SectionHeader } from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from '../utils/money';
import { formatDate, formatDateLong } from '../utils/date';
import { confirm, notify } from '../utils/dialog';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { EXPENSE_TYPE_LABELS, type ExpenseType, type Game } from '../api/types';

const TYPE_ICONS: Record<ExpenseType, keyof typeof Ionicons.glyphMap> = {
  DINNER: 'restaurant-outline',
  DRINKS: 'wine-outline',
  SNACKS: 'fast-food-outline',
  CARDS: 'albums-outline',
  VENUE: 'home-outline',
  TRAVEL: 'car-outline',
  OTHER: 'receipt-outline',
};

export function GameDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'GameDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, isAdmin, user } = useAuth();
  const { gameId } = route.params;

  const { data, loading, error, refreshing, refetch, setData } = useApiQuery<{ game: Game }>(
    (client) => client.game(gameId),
    [gameId],
  );

  const game = data?.game;

  React.useEffect(() => {
    if (game) navigation.setOptions({ title: game.title ?? formatDate(game.playedOn) });
  }, [navigation, game]);

  function confirmDelete() {
    if (!game) return;
    confirm({
      title: 'Delete this game?',
      message: 'The players and costs recorded for this night go with it. This cannot be undone.',
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
            label="Edit this game"
            icon="create-outline"
            variant="secondary"
            onPress={() => navigation.navigate('GameEditor', { gameId: game.id })}
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
          {game.topWinner ? (
            <Badge label={`${game.topWinner.displayName} won most`} tone="win" icon="trophy" />
          ) : null}
        </View>

        {/* Chips leave the bank and come back to it; the costs sit alongside. */}
        <View style={styles.maths}>
          <MathRow label="Chips bought" value={formatMoney(game.totals.buyIn)} />
          <MathRow label="Chips cashed back in" value={formatMoney(game.totals.cashOut)} />
          <MathRow label="Spent on the night" value={formatMoney(game.totals.expenses)} />
          <View style={styles.mathsTotal}>
            <Text style={styles.mathsTotalLabel}>
              {game.balanced ? 'Chips add up' : 'Chips do not add up'}
            </Text>
            {game.balanced ? (
              <Badge label="Balanced" tone="win" icon="checkmark-circle" />
            ) : (
              <Text style={styles.mathsBad}>{formatMoney(Math.abs(game.totals.difference))}</Text>
            )}
          </View>
          {game.banker ? <MathRow label="Banker" value={game.banker.displayName} /> : null}
        </View>

        {!game.balanced ? (
          <View style={styles.imbalance}>
            <Ionicons name="alert-circle" size={15} color={colors.warn} />
            <Text style={styles.imbalanceText}>
              {game.totals.difference > 0
                ? `${formatMoney(game.totals.difference)} of chips never came back to the banker. Someone's cash-out is probably too low.`
                : `${formatMoney(Math.abs(game.totals.difference))} more was cashed out than was ever bought. Check the cash-outs.`}
            </Text>
          </View>
        ) : null}

        {game.notes ? <Text style={styles.notes}>{game.notes}</Text> : null}
      </Card>

      <SectionHeader title="At the table" />
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
                {player.isTopWinner ? (
                  <Ionicons name="trophy" size={13} color={colors.gold} />
                ) : null}
                {player.isBanker ? (
                  <Ionicons name="wallet" size={12} color={colors.feltSoft} />
                ) : null}
              </View>
              <Text style={styles.cell}>{formatMoney(player.buyIn, { bare: true })}</Text>
              <Text style={styles.cell}>{formatMoney(player.cashOut, { bare: true })}</Text>
              <View style={styles.netCell}>
                <Money value={player.net} signed size="small" />
              </View>
            </View>

            {/* Why the net is not simply out minus in. */}
            {player.expenseShare > 0 ? (
              <Text style={styles.playerSub}>
                {formatMoney(player.tableNet, { signed: true })} at the table, less{' '}
                {formatMoney(player.expenseShare)} of the night&apos;s costs
              </Text>
            ) : null}
          </Pressable>
        ))}
      </Card>

      <SectionHeader
        title="What the night cost"
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
                <Ionicons name={TYPE_ICONS[expense.type] ?? 'receipt-outline'} size={16} color={colors.feltSoft} />
              </View>
              <View style={styles.expenseBody}>
                <Text style={styles.expenseLabel}>{EXPENSE_TYPE_LABELS[expense.type] ?? 'Cost'}</Text>
                <Text style={styles.expenseMeta} numberOfLines={1}>
                  {expense.label ? `${expense.label} · ` : ''}
                  {expense.carriedBy.length > 0
                    ? expense.carriedBy.map((person) => person.displayName).join(' and ')
                    : 'nobody yet'}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>{formatMoney(expense.amount)}</Text>
              {isAdmin ? (
                <Pressable onPress={() => removeExpense(expense.id)} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      )}

      {isAdmin ? (
        <Button
          label="Delete this game"
          variant="danger"
          style={styles.deleteButton}
          onPress={confirmDelete}
        />
      ) : null}
    </Screen>
  );
}

function MathRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mathRow}>
      <Text style={styles.mathLabel}>{label}</Text>
      <Text style={styles.mathValue}>{value}</Text>
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

  maths: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
    gap: spacing(2),
  },
  mathRow: { flexDirection: 'row', justifyContent: 'space-between' },
  mathLabel: { ...font.small, color: colors.inkMuted },
  mathValue: { ...font.smallStrong, color: colors.ink },
  mathsTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(2.5),
    marginTop: spacing(1),
  },
  mathsTotalLabel: { ...font.smallStrong, color: colors.ink },
  mathsBad: { ...font.smallStrong, color: colors.warn },

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
  playerSub: {
    ...font.small,
    color: colors.inkFaint,
    fontSize: 11,
    marginTop: spacing(1),
    marginLeft: 38,
  },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pressed: { opacity: 0.6, backgroundColor: colors.surfaceMuted },
  playerName: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing(2) },
  playerLabel: { ...font.bodyStrong, color: colors.ink, flexShrink: 1 },
  playerIsMe: { color: colors.felt },
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

  muted: { ...font.small, color: colors.inkMuted, lineHeight: 20 },
  deleteButton: { marginTop: spacing(6) },
});
