import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Badge, Button, Card, EmptyState, ErrorNotice, LoadingView, Money } from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from '../utils/money';
import { formatDate } from '../utils/date';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { GameSummary } from '../api/types';

export function GamesScreen() {
  const { user, isAdmin } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data, loading, error, refreshing, refetch } = useApiQuery<{ games: GameSummary[] }>(
    (api) => api.games(),
  );

  const games = data?.games ?? [];

  return (
    <Screen
      onRefresh={refetch}
      refreshing={refreshing}
      footer={
        isAdmin ? (
          <Button
            label="Record a game night"
            icon="add"
            onPress={() => navigation.navigate('GameEditor', {})}
          />
        ) : undefined
      }
    >
      <View style={styles.list}>
        {loading && !data ? <LoadingView /> : null}
        {error && !data ? <ErrorNotice message={error} onRetry={refetch} /> : null}

        {!loading && games.length === 0 ? (
          <Card>
            <EmptyState
              icon="dice-outline"
              title="No games yet"
              message={
                isAdmin
                  ? 'Record a game night to start the ledger.'
                  : 'Games recorded by the admin will show up here.'
              }
            />
          </Card>
        ) : null}

        {games.map((game) => {
          const mine = game.players.find((player) => player.userId === user?.id);
          return (
            <Pressable
              key={game.id}
              onPress={() => navigation.navigate('GameDetail', { gameId: game.id })}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Card style={styles.gameCard}>
                <View style={styles.gameHeader}>
                  <View style={styles.gameHeaderText}>
                    <Text style={styles.gameTitle} numberOfLines={1}>
                      {game.title ?? 'Game night'}
                    </Text>
                    <Text style={styles.gameDate}>
                      {formatDate(game.playedOn)}
                      {game.location ? ` · ${game.location}` : ''}
                    </Text>
                  </View>
                  {game.balanced ? null : (
                    <Badge label="Check numbers" tone="warn" icon="alert-circle-outline" />
                  )}
                </View>

                <View style={styles.stats}>
                  <Stat label="Players" value={String(game.playerCount)} />
                  <Stat label="Pot" value={formatMoney(game.totals.buyIn)} />
                  <Stat label="Spent" value={formatMoney(game.totals.expenses)} />
                  {mine ? (
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>YOU</Text>
                      <Money value={mine.net} signed size="small" />
                    </View>
                  ) : null}
                </View>

                {game.topWinner ? (
                  <View style={styles.winnerRow}>
                    <Ionicons name="trophy" size={13} color={colors.gold} />
                    <Text style={styles.winnerText}>{game.topWinner.displayName} won the most</Text>
                  </View>
                ) : null}

                {!game.balanced ? (
                  <View style={styles.warnRow}>
                    <Ionicons name="alert-circle-outline" size={13} color={colors.warn} />
                    <Text style={styles.warnText}>
                      Chips out by {formatMoney(Math.abs(game.totals.difference))}
                    </Text>
                  </View>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing(4), gap: spacing(3) },
  pressed: { opacity: 0.7 },
  gameCard: { gap: spacing(3) },
  gameHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) },
  gameHeaderText: { flex: 1 },
  gameTitle: { ...font.heading, color: colors.ink },
  gameDate: { ...font.small, color: colors.inkMuted, marginTop: 2 },

  stats: {
    flexDirection: 'row',
    gap: spacing(5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
  },
  stat: { minWidth: 52 },
  statLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10 },
  statValue: { ...font.smallStrong, color: colors.ink, marginTop: 2 },

  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  winnerText: { ...font.small, color: colors.inkMuted, flex: 1 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  warnText: { ...font.small, color: colors.warn, flex: 1 },
});
