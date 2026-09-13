import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import {
  Avatar,
  Badge,
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
import { formatDate } from '../utils/date';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { HistoryRow, Player, PlayerStats } from '../api/types';

export function PlayerDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { playerId } = route.params;

  const { data, loading, error, refreshing, refetch } = useApiQuery<{
    player: Player;
    stats: PlayerStats;
    history: HistoryRow[];
  }>((api) => api.player(playerId), [playerId]);

  React.useEffect(() => {
    if (data?.player) navigation.setOptions({ title: data.player.displayName });
  }, [navigation, data?.player]);

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <Screen><ErrorNotice message={error} onRetry={refetch} /></Screen>;
  if (!data) return null;

  const { player, stats, history } = data;
  const isMe = player.id === user?.id;

  return (
    <Screen onRefresh={refetch} refreshing={refreshing}>
      <Card style={styles.profile}>
        <Avatar name={player.displayName} color={player.avatarColor} size={62} />
        <View style={styles.profileText}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{player.displayName}</Text>
            {player.role === 'ADMIN' ? <Badge label="Admin" tone="felt" /> : null}
            {!player.isActive ? <Badge label="Inactive" tone="loss" /> : null}
          </View>
          <Text style={styles.username}>@{player.username}</Text>
          {stats.lastPlayedOn ? (
            <Text style={styles.lastPlayed}>Last played {formatDate(stats.lastPlayedOn)}</Text>
          ) : (
            <Text style={styles.lastPlayed}>Yet to sit down at a game</Text>
          )}
        </View>
      </Card>

      <SectionHeader title={isMe ? 'Your record' : 'Record'} />
      <View style={styles.tiles}>
        <StatTile
          label="Lifetime"
          value={formatMoney(stats.netProfit, { signed: true })}
          tone={stats.netProfit > 0 ? 'win' : stats.netProfit < 0 ? 'loss' : 'neutral'}
        />
        <StatTile label="Games" value={String(stats.gamesPlayed)} caption={`${stats.wins} won`} />
        <StatTile label="Win rate" value={`${stats.winRate}%`} />
      </View>
      <View style={[styles.tiles, styles.tilesSecond]}>
        <StatTile
          label="Best night"
          value={formatMoney(stats.bestGame, { signed: true })}
          tone={stats.bestGame > 0 ? 'win' : 'neutral'}
        />
        <StatTile
          label="Worst night"
          value={formatMoney(stats.worstGame, { signed: true })}
          tone={stats.worstGame < 0 ? 'loss' : 'neutral'}
        />
        <StatTile label="Average" value={formatMoney(stats.averageNet, { signed: true })} />
      </View>

      <SectionHeader title="Playing history" />
      {history.length === 0 ? (
        <Card>
          <EmptyState icon="time-outline" title="No games yet" message="Nothing on the record so far." />
        </Card>
      ) : (
        <Card padded={false}>
          {history.map((row, index) => (
            <Pressable
              key={row.gameId}
              onPress={() => navigation.navigate('GameDetail', { gameId: row.gameId })}
              style={({ pressed }) => [
                styles.historyRow,
                index < history.length - 1 && styles.divided,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.historyBody}>
                <View style={styles.historyTitleRow}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {row.title ?? 'Game night'}
                  </Text>
                  {row.isWinner ? <Ionicons name="trophy" size={12} color={colors.gold} /> : null}
                </View>
                <Text style={styles.historyMeta} numberOfLines={1}>
                  {formatDate(row.playedOn)} · in {formatMoney(row.buyIn)} · out{' '}
                  {formatMoney(row.cashOut)}
                </Text>
              </View>
              <Money value={row.net} signed size="heading" />
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  profileText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  name: { ...font.title, color: colors.ink, flexShrink: 1 },
  username: { ...font.small, color: colors.inkMuted, marginTop: 2 },
  lastPlayed: { ...font.small, color: colors.inkFaint, marginTop: spacing(1) },

  tiles: { flexDirection: 'row', gap: spacing(2) },
  tilesSecond: { marginTop: spacing(2) },

  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
  },
  pressed: { opacity: 0.6, backgroundColor: colors.surfaceMuted },
  historyBody: { flex: 1 },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  historyTitle: { ...font.bodyStrong, color: colors.ink, flexShrink: 1 },
  historyMeta: { ...font.small, color: colors.inkMuted, marginTop: 2 },
});
