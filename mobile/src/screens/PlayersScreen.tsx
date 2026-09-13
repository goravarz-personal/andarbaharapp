import React, { useState } from 'react';
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
  SegmentedControl,
} from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from '../utils/money';
import { plural } from '../utils/date';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { LeaderboardRow } from '../api/types';

type Sort = 'NET' | 'GAMES' | 'NAME';

export function PlayersScreen() {
  const { user, isAdmin } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [sort, setSort] = useState<Sort>('NET');

  const { data, loading, error, refreshing, refetch } = useApiQuery<{
    leaderboard: LeaderboardRow[];
  }>((api) => api.leaderboard());

  const rows = [...(data?.leaderboard ?? [])].sort((a, b) => {
    if (sort === 'NAME') return a.displayName.localeCompare(b.displayName);
    if (sort === 'GAMES') return b.stats.gamesPlayed - a.stats.gamesPlayed;
    return b.stats.netProfit - a.stats.netProfit;
  });

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <Screen><ErrorNotice message={error} onRetry={refetch} /></Screen>;

  return (
    <Screen
      onRefresh={refetch}
      refreshing={refreshing}
      footer={
        isAdmin ? (
          <Button label="Add a player" icon="person-add" onPress={() => navigation.navigate('AddPlayer')} />
        ) : undefined
      }
    >
      <SegmentedControl<Sort>
        value={sort}
        onChange={setSort}
        options={[
          { value: 'NET', label: 'By winnings' },
          { value: 'GAMES', label: 'By games' },
          { value: 'NAME', label: 'A–Z' },
        ]}
      />

      {rows.length === 0 ? (
        <Card style={styles.spaced}>
          <EmptyState icon="people-outline" title="No players yet" />
        </Card>
      ) : (
        <Card padded={false} style={styles.spaced}>
          {rows.map((row, index) => (
            <Pressable
              key={row.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: row.id })}
              style={({ pressed }) => [
                styles.row,
                index < rows.length - 1 && styles.divided,
                pressed && styles.pressed,
              ]}
            >
              {sort === 'NET' ? (
                <Text style={[styles.rank, index < 3 && styles.rankTop]}>{index + 1}</Text>
              ) : null}
              <Avatar name={row.displayName} color={row.avatarColor} size={38} />
              <View style={styles.body}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.displayName}
                    {row.id === user?.id ? ' (you)' : ''}
                  </Text>
                  {row.role === 'ADMIN' ? <Badge label="Admin" tone="felt" /> : null}
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {row.stats.gamesPlayed === 0
                    ? 'Yet to play'
                    : `${plural(row.stats.gamesPlayed, 'game')} · ${plural(row.stats.wins, 'win')}`}
                </Text>
              </View>
              <View style={styles.netCol}>
                <Money value={row.stats.netProfit} signed size="heading" />
                {row.stats.wins > 0 ? (
                  <View style={styles.winRow}>
                    <Ionicons name="trophy" size={10} color={colors.gold} />
                    <Text style={styles.winText}>{row.stats.winRate}%</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      {isAdmin ? (
        <Button
          label="Manage the roster"
          variant="ghost"
          icon="settings-outline"
          onPress={() => navigation.navigate('ManageRoster')}
          style={styles.manage}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  spaced: { marginTop: spacing(4) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    gap: spacing(3),
  },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pressed: { opacity: 0.6, backgroundColor: colors.surfaceMuted },
  rank: { ...font.smallStrong, color: colors.inkFaint, width: 16, textAlign: 'center' },
  rankTop: { color: colors.gold },
  body: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  name: { ...font.bodyStrong, color: colors.ink, flexShrink: 1 },
  meta: { ...font.small, color: colors.inkMuted, marginTop: 2 },
  netCol: { alignItems: 'flex-end' },
  winRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  winText: { ...font.small, color: colors.inkFaint, fontSize: 11 },
  manage: { marginTop: spacing(4) },
});
