import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  LoadingView,
  Money,
  SectionHeader,
  StatTile,
} from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from '../utils/money';
import { formatRelative, plural } from '../utils/date';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Dashboard } from '../api/types';

export function DashboardScreen() {
  const { user, isAdmin } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data, loading, error, refreshing, refetch } = useApiQuery<Dashboard>((api) =>
    api.dashboard(),
  );

  if (loading && !data) return <LoadingView label="Adding up the table…" />;
  if (error && !data) return <Screen><ErrorNotice message={error} onRetry={refetch} /></Screen>;
  if (!data) return null;

  const { stats, balances, totals, recentGames } = data;
  const settleUp = balances.net;

  return (
    <Screen onRefresh={refetch} refreshing={refreshing}>
      <View style={styles.greeting}>
        <View style={styles.greetingText}>
          <Text style={styles.hello}>Hello, {user?.displayName.split(' ')[0]}</Text>
          <Text style={styles.sub}>
            {stats.gamesPlayed === 0
              ? 'No games on your record yet.'
              : `${plural(stats.gamesPlayed, 'game')} played · ${stats.wins} won`}
          </Text>
        </View>
        <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor} size={46} />
      </View>

      {/* The number everyone opens the app for. */}
      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>
          {settleUp > 0 ? 'YOU ARE OWED' : settleUp < 0 ? 'YOU OWE' : 'ALL SQUARE'}
        </Text>
        <Text style={styles.heroAmount}>{formatMoney(Math.abs(settleUp))}</Text>
        <View style={styles.heroSplit}>
          <View style={styles.heroSplitItem}>
            <Text style={styles.heroSplitLabel}>Owed to you</Text>
            <Text style={styles.heroSplitValue}>{formatMoney(balances.totalOwed)}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroSplitItem}>
            <Text style={styles.heroSplitLabel}>You owe</Text>
            <Text style={styles.heroSplitValue}>{formatMoney(balances.totalOwes)}</Text>
          </View>
        </View>
        {balances.owes.length + balances.owed.length > 0 ? (
          <Pressable
            onPress={() => navigation.navigate('Tabs', { screen: 'Settle' })}
            style={styles.heroLink}
          >
            <Text style={styles.heroLinkText}>See who owes whom</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.goldSoft} />
          </Pressable>
        ) : null}
      </Card>

      <SectionHeader title="Your record" />
      <View style={styles.tiles}>
        <StatTile
          label="Lifetime"
          value={formatMoney(stats.netProfit, { signed: true })}
          tone={stats.netProfit > 0 ? 'win' : stats.netProfit < 0 ? 'loss' : 'neutral'}
        />
        <StatTile label="Win rate" value={`${stats.winRate}%`} caption={`${stats.wins} wins`} />
        <StatTile
          label="Best night"
          value={formatMoney(stats.bestGame, { signed: true })}
          tone={stats.bestGame > 0 ? 'win' : 'neutral'}
        />
      </View>

      <SectionHeader
        title="Recent games"
        action="See all"
        onAction={() => navigation.navigate('Tabs', { screen: 'Games' })}
      />

      {recentGames.length === 0 ? (
        <Card>
          <EmptyState
            icon="dice-outline"
            title="No games yet"
            message={
              isAdmin
                ? 'Record your first game night and the ledger starts here.'
                : 'Once the admin records a game night, it shows up here.'
            }
            action={isAdmin ? 'Record a game' : undefined}
            onAction={isAdmin ? () => navigation.navigate('GameEditor', {}) : undefined}
          />
        </Card>
      ) : (
        <Card padded={false}>
          {recentGames.map((game, index) => {
            const mine = game.players.find((player) => player.userId === user?.id);
            return (
              <Pressable
                key={game.id}
                onPress={() => navigation.navigate('GameDetail', { gameId: game.id })}
                style={({ pressed }) => [
                  styles.gameRow,
                  index < recentGames.length - 1 && styles.gameRowDivided,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.gameRowBody}>
                  <Text style={styles.gameTitle} numberOfLines={1}>
                    {game.title ?? 'Game night'}
                  </Text>
                  <Text style={styles.gameMeta}>
                    {formatRelative(game.playedOn)} · {plural(game.playerCount, 'player')}
                  </Text>
                </View>
                {mine ? (
                  <Money value={mine.net} signed size="heading" />
                ) : (
                  <Badge label="Did not play" />
                )}
              </Pressable>
            );
          })}
        </Card>
      )}

      {isAdmin ? (
        <Button
          label="Record a game night"
          icon="add"
          onPress={() => navigation.navigate('GameEditor', {})}
          style={styles.cta}
        />
      ) : null}

      <Text style={styles.footprint}>
        {totals.games} games · {totals.players} players on the books
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(5) },
  greetingText: { flex: 1 },
  hello: { ...font.title, color: colors.ink },
  sub: { ...font.small, color: colors.inkMuted, marginTop: 2 },

  heroCard: { backgroundColor: colors.felt, borderColor: colors.feltDeep },
  heroLabel: { ...font.caption, color: colors.gold },
  heroAmount: { fontSize: 38, fontWeight: '700', color: colors.white, marginTop: spacing(1) },
  heroSplit: {
    flexDirection: 'row',
    marginTop: spacing(4),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.feltSoft,
    paddingTop: spacing(3),
  },
  heroSplitItem: { flex: 1 },
  heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.feltSoft },
  heroSplitLabel: { ...font.small, color: colors.goldSoft, opacity: 0.75 },
  heroSplitValue: { ...font.heading, color: colors.white, marginTop: 2 },
  heroLink: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: spacing(4) },
  heroLinkText: { ...font.smallStrong, color: colors.goldSoft },

  tiles: { flexDirection: 'row', gap: spacing(2) },

  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
  },
  gameRowDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  gameRowBody: { flex: 1, marginRight: spacing(3) },
  gameTitle: { ...font.bodyStrong, color: colors.ink },
  gameMeta: { ...font.small, color: colors.inkMuted, marginTop: 1 },
  pressed: { opacity: 0.6, backgroundColor: colors.surfaceMuted },

  cta: { marginTop: spacing(5) },
  footprint: {
    ...font.small,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: spacing(6),
  },
});
