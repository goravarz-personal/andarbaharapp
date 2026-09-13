import React, { useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Button, Card, SegmentedControl, TextField } from '../components';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';
import type { Role } from '../api/types';

/** Admin adds someone to the group. They get their own login straight away. */
export function AddPlayerScreen() {
  const { api } = useAuth();
  const navigation = useNavigation();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('PLAYER');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(
    null,
  );

  async function submit() {
    setError(null);
    setFieldErrors({});

    if (!displayName.trim()) return setFieldErrors({ displayName: 'What is their name?' });

    const handle = (username.trim() || displayName.trim().split(' ')[0] || '').toLowerCase();
    if (handle.length < 3) {
      return setFieldErrors({ username: 'Pick a username of at least 3 characters.' });
    }

    setBusy(true);
    try {
      const response = await api.createPlayer({
        username: handle,
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
      });
      setCreated({
        name: response.player.displayName,
        username: response.player.username,
        password: response.temporaryPassword ?? '(set by you)',
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields) setFieldErrors(caught.fields);
      setError(caught instanceof Error ? caught.message : 'Could not add the player.');
    } finally {
      setBusy(false);
    }
  }

  // Once created, show the one-time password so it can be passed on.
  if (created) {
    return (
      <Screen footer={<Button label="Done" onPress={() => navigation.goBack()} />}>
        <Card style={styles.doneCard}>
          <View style={styles.tick}>
            <Ionicons name="checkmark" size={26} color={colors.white} />
          </View>
          <Text style={styles.doneTitle}>{created.name} is on the roster</Text>
          <Text style={styles.doneText}>
            Give them these details. The app will ask them to pick their own password when they
            first sign in.
          </Text>

          <View style={styles.credentials}>
            <Credential label="Username" value={created.username} />
            <Credential label="Temporary password" value={created.password} />
          </View>

          <Button
            label="Send them their sign-in"
            variant="secondary"
            icon="share-outline"
            onPress={() =>
              void Share.share({
                message:
                  `You're on the AadarBahar ledger.\n\n` +
                  `Username: ${created.username}\n` +
                  `Password: ${created.password}\n\n` +
                  `Sign in and the app will ask you to pick your own password.`,
              })
            }
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Add player" onPress={submit} loading={busy} />}>
      <Card>
        <TextField
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Ravi Kumar"
          error={fieldErrors.displayName}
          autoCapitalize="words"
        />
        <TextField
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="ravi"
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.username}
          hint="What they type to sign in. Letters, numbers, dots and dashes."
        />
        <TextField
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+91 98765 43210"
          error={fieldErrors.phone}
        />
        <TextField
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="ravi@example.com"
          error={fieldErrors.email}
        />

        <Text style={styles.roleLabel}>What can they do</Text>
        <SegmentedControl<Role>
          value={role}
          onChange={setRole}
          options={[
            { value: 'PLAYER', label: 'Player' },
            { value: 'ADMIN', label: 'Admin' },
          ]}
        />
        <Text style={styles.roleHint}>
          {role === 'PLAYER'
            ? 'Sees every game, player and payment, and confirms money paid to them.'
            : 'Full control: records games, edits any number, manages the roster.'}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>
    </Screen>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.credential}>
      <Text style={styles.credentialLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.credentialValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  roleLabel: { ...font.smallStrong, color: colors.inkMuted, marginBottom: spacing(1.5) },
  roleHint: { ...font.small, color: colors.inkFaint, marginTop: spacing(2), lineHeight: 18 },
  error: { ...font.small, color: colors.loss, marginTop: spacing(3) },

  doneCard: { alignItems: 'center', gap: spacing(3) },
  tick: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.win,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: { ...font.title, color: colors.ink, textAlign: 'center' },
  doneText: { ...font.small, color: colors.inkMuted, textAlign: 'center', lineHeight: 20 },
  credentials: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(3),
  },
  credential: {},
  credentialLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10 },
  credentialValue: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 17,
    color: colors.felt,
    marginTop: 2,
  },
});
