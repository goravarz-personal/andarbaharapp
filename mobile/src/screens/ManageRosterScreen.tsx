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
  ErrorNotice,
  LoadingView,
  SectionHeader,
  TextField,
} from '../components';
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
  /** Which player's name is being edited, and what it has been changed to. */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  /** Which player's password is being reset, and what was typed for it. */
  const [resetting, setResetting] = useState<
    { id: string; name: string; username: string; password: string } | null
  >(null);

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

  async function saveName() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) {
      notify('Name cannot be empty', 'Give them something to be called.');
      return;
    }
    const id = renaming.id;
    setRenaming(null);
    await act(id, () => api.updatePlayer(id, { displayName: name }), 'Could not rename them');
  }

  /** Generate one for them, or set one you have already agreed out loud. */
  async function savePassword() {
    if (!resetting) return;
    const chosen = resetting.password.trim();
    if (chosen && chosen.length < 6) {
      notify('Too short', 'A password needs at least 6 characters.');
      return;
    }
    const { id, name, username } = resetting;
    setResetting(null);
    await act(
      id,
      async () => {
        const response = await api.resetPlayerPassword(id, chosen || undefined);
        notify(
          chosen ? 'Password set' : 'New temporary password',
          `${name} signs in with:\n\nUsername: ${username}\nPassword: ${response.password}` +
            (chosen ? '' : '\n\nThey will be asked to change it.'),
        );
      },
      'Could not reset the password',
    );
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
          renaming={renaming?.id === player.id ? renaming.name : null}
          onRenameChange={(name) => setRenaming({ id: player.id, name })}
          onRenameStart={() => setRenaming({ id: player.id, name: player.displayName })}
          onRenameCancel={() => setRenaming(null)}
          onRenameSave={saveName}
          onOpen={() => navigation.navigate('PlayerDetail', { playerId: player.id })}
          resetting={resetting?.id === player.id ? resetting.password : null}
          onResetStart={() =>
            setResetting({
              id: player.id,
              name: player.displayName,
              username: player.username,
              password: '',
            })
          }
          onResetChange={(password) =>
            setResetting((current) => (current ? { ...current, password } : current))
          }
          onResetCancel={() => setResetting(null)}
          onResetSave={savePassword}
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
              renaming={renaming?.id === player.id ? renaming.name : null}
              onRenameChange={(name) => setRenaming({ id: player.id, name })}
              onRenameStart={() => setRenaming({ id: player.id, name: player.displayName })}
              onRenameCancel={() => setRenaming(null)}
              onRenameSave={saveName}
              onOpen={() => navigation.navigate('PlayerDetail', { playerId: player.id })}
              resetting={resetting?.id === player.id ? resetting.password : null}
          onResetStart={() =>
            setResetting({
              id: player.id,
              name: player.displayName,
              username: player.username,
              password: '',
            })
          }
          onResetChange={(password) =>
            setResetting((current) => (current ? { ...current, password } : current))
          }
          onResetCancel={() => setResetting(null)}
          onResetSave={savePassword}
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
  renaming,
  onRenameStart,
  onRenameChange,
  onRenameCancel,
  onRenameSave,
  onOpen,
  resetting,
  onResetStart,
  onResetChange,
  onResetCancel,
  onResetSave,
  onToggleRole,
  onToggleActive,
}: {
  player: Player;
  isMe: boolean;
  busy: boolean;
  /** The in-progress name, or null when this card is not being renamed. */
  renaming: string | null;
  onRenameStart: () => void;
  onRenameChange: (name: string) => void;
  onRenameCancel: () => void;
  onRenameSave: () => void;
  onOpen: () => void;
  /** The in-progress password, or null when this card is not being reset. */
  resetting: string | null;
  onResetStart: () => void;
  onResetChange: (password: string) => void;
  onResetCancel: () => void;
  onResetSave: () => void;
  onToggleRole: () => void;
  onToggleActive: () => void;
}) {
  if (renaming !== null) {
    return (
      <Card style={styles.card}>
        <TextField
          label={`Name for @${player.username}`}
          value={renaming}
          onChangeText={onRenameChange}
          autoFocus
          autoCapitalize="words"
          onSubmitEditing={onRenameSave}
        />
        <View style={styles.renameActions}>
          <Button label="Cancel" variant="ghost" onPress={onRenameCancel} style={styles.renameButton} />
          <Button label="Save" onPress={onRenameSave} style={styles.renameButton} />
        </View>
      </Card>
    );
  }

  if (resetting !== null) {
    return (
      <Card style={styles.card}>
        <TextField
          label={`New password for @${player.username}`}
          value={resetting}
          onChangeText={onResetChange}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Leave blank to generate one"
          hint="They are signed out everywhere either way."
          onSubmitEditing={onResetSave}
        />
        <View style={styles.renameActions}>
          <Button label="Cancel" variant="ghost" onPress={onResetCancel} style={styles.renameButton} />
          <Button label="Set it" onPress={onResetSave} style={styles.renameButton} />
        </View>
      </Card>
    );
  }

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
        <Action icon="pencil-outline" label="Rename" onPress={onRenameStart} />
        <Action icon="key-outline" label="Password" onPress={onResetStart} />
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
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
    rowGap: spacing(3),
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    // Two per row on a phone, rather than four squeezed and wrapping mid-word.
    width: '50%',
  },
  renameActions: { flexDirection: 'row', gap: spacing(2) },
  renameButton: { flex: 1 },
  actionPressed: { opacity: 0.5 },
  actionText: { ...font.small, fontSize: 12, fontWeight: '600' },
});
