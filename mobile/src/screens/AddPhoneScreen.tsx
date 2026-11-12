import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Button, Card, TextField } from '../components';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../api/client';
import { looksLikeANumber } from '../utils/phone';
import { useLeaveGate } from '../navigation/useLeaveGate';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

/**
 * Collects the one thing the app cannot work without: a number WhatsApp can
 * reach. The night's summary goes out on WhatsApp, so a player with no number
 * is a player who never gets told how the night went.
 *
 * Shown as a wall rather than a prompt when it is forced - there is nothing
 * else to do in the app until it is filled in - and as an ordinary editable
 * screen when someone opens it themselves.
 */
export function AddPhoneScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AddPhone'>>();
  const navigation = useNavigation();
  const { api, user, mustAddPhone, refreshUser, signOut } = useAuth();
  const forced = route.params?.forced ?? false;
  useLeaveGate(forced, mustAddPhone);

  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!looksLikeANumber(phone)) {
      return setError('That does not look like a mobile number yet.');
    }

    setBusy(true);
    try {
      await api.updateMe({ phone: phone.trim() });
      // Refreshing is what lifts the gate: the server decides whether a number
      // is on file, and the app asks it again rather than assuming.
      await refreshUser();
      if (!forced) navigation.goBack();
      // When it was forced, useLeaveGate takes it from here.
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not save your number.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button label="Save my number" onPress={submit} loading={busy} />}>
      {forced ? (
        <Card style={styles.notice}>
          <View style={styles.noticeIcon}>
            <Ionicons name="logo-whatsapp" size={24} color={colors.white} />
          </View>
          <Text style={styles.noticeTitle}>What is your mobile number?</Text>
          <Text style={styles.noticeText}>
            The night&apos;s results go out on WhatsApp when the game finishes. Add the number you
            use there and you will get them with everyone else.
          </Text>
        </Card>
      ) : null}

      <Card>
        <TextField
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="98765 43210"
          autoFocus
          error={error ?? undefined}
          hint="An Indian number can go in without the +91. For anywhere else, start with the country code."
          style={styles.lastField}
        />
      </Card>

      <Text style={styles.privacy}>
        Only the others on the roster can see it, the same as your name. It is used for the game
        night messages and nothing else.
      </Text>

      {forced ? (
        <Button
          label="Sign out instead"
          variant="ghost"
          style={styles.signOut}
          onPress={() => void signOut()}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { alignItems: 'center', gap: spacing(2), marginBottom: spacing(4) },
  noticeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.win,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(1),
  },
  noticeTitle: { ...font.title, color: colors.ink, textAlign: 'center' },
  noticeText: {
    ...font.small,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  lastField: { marginBottom: 0 },
  privacy: {
    ...font.small,
    color: colors.inkFaint,
    lineHeight: 18,
    marginTop: spacing(4),
    paddingHorizontal: spacing(1),
  },
  signOut: { marginTop: spacing(6) },
});
