import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button, Card, TextField } from '../components';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../api/client';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

export function ChangePasswordScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ChangePassword'>>();
  const navigation = useNavigation();
  const { api, applyNewToken, signOut } = useAuth();
  const forced = route.params?.forced ?? false;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword.length < 6) return setError('Pick a password of at least 6 characters.');
    if (newPassword !== confirmPassword) return setError('The two new passwords do not match.');

    setBusy(true);
    try {
      const response = await api.changePassword(currentPassword, newPassword);
      // The server retires old tokens on a password change, so take the new one.
      await applyNewToken(response.token, response.user);
      if (!forced) navigation.goBack();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {forced ? (
        <Card style={styles.notice}>
          <Text style={styles.noticeTitle}>Pick your own password</Text>
          <Text style={styles.noticeText}>
            You are signed in with a temporary password. Choose one only you know before carrying
            on.
          </Text>
        </Card>
      ) : null}

      <Card>
        <TextField
          label={forced ? 'Temporary password' : 'Current password'}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextField
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          hint="At least 6 characters."
        />
        <TextField
          label="New password again"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          onSubmitEditing={submit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Change password" onPress={submit} loading={busy} />
      </Card>

      {forced ? (
        <Button label="Sign out instead" variant="ghost" onPress={() => void signOut()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.warnSoft, borderColor: colors.warn, marginBottom: spacing(4) },
  noticeTitle: { ...font.heading, color: colors.warn },
  noticeText: { ...font.small, color: colors.ink, marginTop: spacing(1.5), lineHeight: 20 },
  error: { ...font.small, color: colors.loss, marginBottom: spacing(3) },
});
