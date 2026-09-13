import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar, Badge, Button, Card, ErrorNotice, LoadingView, SectionHeader } from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { confirm, notify } from '../utils/dialog';
import type { Player } from '../api/types';

/** Admin-only: roles, password resets, and who is still in the group. */
export function ManageRosterScreen() {
  const { api, user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [working, setWorking] = useState<string | null>(null);

  const { data, loading, error, refreshing, refetch } = useApiQuery<{ players: Player[] }>((client) =>
    client.players(true),
  );

  async function act(id: string, run: () => Promise<unknown>, failure: string) {
    setWorking(id);
    try {
      await run();
      refetch();
    } catch (caught) {
      notify(failure, caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setWorking(null);
    }
  }

  function resetPassword(player: Player) {
    confirm({
      title: `Reset ${player.displayName}'s password?`,
      message: 'They will be signed out everywhere and given a new temporary password.',
      confirmLabel: 'Reset',
      destructive: true,
      onConfirm: () =>
        void act(
          player.id,
          async () => {
            const response = await api.resetPlayerPassword(player.id);
            notify(
              'New temporary password',
              `${player.displayName} signs in with:\n\nUsername: ${response.player.username}\nPassword: ${response.password}\n\nThey will be asked to change it.`,
            );
          },
          'Could not reset the password',
        ),
    });
  }

  function toggleRole(player: Player) {
    const makingAdmin = player.role !== 'ADMIN';
    confirm({
      title: makingAdmin
        ? `Make ${player.displayName} an admin?`
        : `Remove ${player.displayName}'s admin access?`,
      message: makingAdmin
        ? 'Admins can record and edit any game, and manage everyone on the roster.'
        : 'They will still see everything, but can no longer change games or players.',
      confirmLabel: makingAdmin ? 'Make admin' : 'Remove access',
      onConfirm: () =>
        void act(
          player.id,
          () => api.updatePlayer(player.id, { role: makingAdmin ? 'ADMIN' : 'PLAYER' }),
          'Could not change their role',
        ),
    });
  }

  function toggleActive(player: Player) {
    const reactivating = !player.isActive;
    confirm({
      title: reactivating ? `Bring ${player.displayName} back?` : `Deactivate ${player.displayName}?`,
      message: reactivating
        ? 'They will be able to sign in again and join new games.'
        : 'They keep their game history but cannot sign in or be added to new games.',
      confirmLabel: reactivating ? 'Reactivate' : 'Deactivate',
      destructive: !reactivating,
      onConfirm: () =>
        void act(
          player.id,
          () => api.updatePlayer(player.id, { isActive: reactivating }),
          'Could not update them',
        ),
    });
  }

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <Screen><ErrorNotice message={error} onRetry={refetch} /></Screen>;

  const players = data?.players ?? [];
  const active = players.filter((player) => player.isActive);
  const inactive = players.filter((player) => !player.isActive);

  return (
    <Screen
      onRefresh={refetch}
      refreshing={refreshing}
      footer={
        <Button label="Add a player" icon="person-add" onPress={() => navigation.navigate('AddPlayer')} />
      }
    >
      {active.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          isMe={player.id === user?.id}
          busy={working === player.id}
          onOpen={() => navigation.navigate('PlayerDetail', { playerId: player.id })}
          onResetPassword={() => resetPassword(player)}
          onToggleRole={() => toggleRole(player)}
          onToggleActive={() => toggleActive(player)}
        />
      ))}

      {inactive.length > 0 ? (
        <>
          <SectionHeader title="No longer playing" />
          {inactive.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isMe={player.id === user?.id}
              busy={working === player.id}
              onOpen={() => navigation.navigate('PlayerDetail', { playerId: player.id })}
              onResetPassword={() => resetPassword(player)}
              onToggleRole={() => toggleRole(player)}
              onToggleActive={() => toggleActive(player)}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function PlayerCard({
  player,
  isMe,
  busy,
  onOpen,
  onResetPassword,
  onToggleRole,
  onToggleActive,
}: {
  player: Player;
  isMe: boolean;
  busy: boolean;
  onOpen: () => void;
  onResetPassword: () => void;
  onToggleRole: () => void;
  onToggleActive: () => void;
}) {
  return (
    <Card style={[styles.card, busy && styles.busy]}>
      <Pressable onPress={onOpen} style={styles.head}>
        <Avatar name={player.displayName} color={player.avatarColor} size={38} />
        <View style={styles.headText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {player.displayName}
              {isMe ? ' (you)' : ''}
            </Text>
            {player.role === 'ADMIN' ? <Badge label="Admin" tone="felt" /> : null}
            {player.mustChangePassword ? <Badge label="Temp password" tone="warn" /> : null}
          </View>
          <Text style={styles.username}>@{player.username}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
      </Pressable>

      <View style={styles.actions}>
        <Action icon="key-outline" label="Reset password" onPress={onResetPassword} />
        <Action
          icon={player.role === 'ADMIN' ? 'person-outline' : 'shield-checkmark-outline'}
          label={player.role === 'ADMIN' ? 'Make player' : 'Make admin'}
          onPress={onToggleRole}
          disabled={isMe}
        />
        <Action
          icon={player.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
          label={player.isActive ? 'Deactivate' : 'Reactivate'}
          onPress={onToggleActive}
          disabled={isMe}
          tone={player.isActive ? 'danger' : 'default'}
        />
      </View>
    </Card>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled = false,
  tone = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const color = disabled ? colors.inkFaint : tone === 'danger' ? colors.loss : colors.felt;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, pressed && !disabled && styles.actionPressed]}
    >
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing(3), gap: spacing(3) },
  busy: { opacity: 0.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  headText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  name: { ...font.bodyStrong, color: colors.ink, flexShrink: 1 },
  username: { ...font.small, color: colors.inkMuted, marginTop: 1 },
  actions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
    gap: spacing(2),
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), flex: 1 },
  actionPressed: { opacity: 0.5 },
  actionText: { ...font.small, fontSize: 12, fontWeight: '600' },
});
