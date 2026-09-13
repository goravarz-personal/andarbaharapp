import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button, Card, TextField } from '../components';
import { useAuth } from '../state/AuthContext';
import { ApiClient } from '../api/client';
import { guessApiUrl, normaliseApiUrl } from '../state/apiUrl';
import { colors, font, spacing } from '../theme';

/**
 * Points the app at whichever machine is running the server. Handy when the
 * group moves the API to a home server or a small VPS.
 */
export function ServerSettingsScreen() {
  const { apiUrl, setApiUrl } = useAuth();
  const navigation = useNavigation();

  const [value, setValue] = useState(apiUrl);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function testAndSave() {
    const url = normaliseApiUrl(value);
    if (!url) {
      setStatus({ ok: false, message: 'Enter the address of your server.' });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      await new ApiClient(url).health();
      await setApiUrl(url);
      setValue(url);
      setStatus({ ok: true, message: 'Connected. Address saved.' });
      setTimeout(() => navigation.goBack(), 600);
    } catch (error) {
      setStatus({
        ok: false,
        message: error instanceof Error ? error.message : 'Could not reach that server.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <TextField
          label="Server address"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.5:4000/api"
          hint="The IP or hostname of the computer running the API. /api is added for you."
        />

        {status ? (
          <Text style={[styles.status, status.ok ? styles.statusOk : styles.statusBad]}>
            {status.message}
          </Text>
        ) : null}

        <Button label="Test and save" onPress={testAndSave} loading={busy} />
        <View style={styles.spacer} />
        <Button
          label="Use the suggested address"
          variant="ghost"
          onPress={() => {
            setValue(guessApiUrl());
            setStatus(null);
          }}
        />
      </Card>

      <Card style={styles.help}>
        <Text style={styles.helpTitle}>Finding the address</Text>
        <Text style={styles.helpText}>
          Start the API with <Text style={styles.mono}>npm run server</Text>, then use the computer&apos;s
          address on your home network - something like{' '}
          <Text style={styles.mono}>http://192.168.1.5:4000</Text>. The phone has to be on the same
          Wi-Fi.
        </Text>
        <Text style={styles.helpText}>
          On the iOS simulator <Text style={styles.mono}>http://localhost:4000</Text> works. On an
          Android emulator use <Text style={styles.mono}>http://10.0.2.2:4000</Text>.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { ...font.small, marginBottom: spacing(3) },
  statusOk: { color: colors.win },
  statusBad: { color: colors.loss },
  spacer: { height: spacing(2) },
  help: { marginTop: spacing(4), gap: spacing(2) },
  helpTitle: { ...font.heading, color: colors.ink },
  helpText: { ...font.small, color: colors.inkMuted, lineHeight: 20 },
  mono: { fontFamily: 'monospace', color: colors.felt },
});
