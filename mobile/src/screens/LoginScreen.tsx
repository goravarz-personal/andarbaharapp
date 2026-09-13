import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Button, Card, TextField } from '../components';
import { InstallCard } from '../components/InstallCard';
import { useAuth } from '../state/AuthContext';
import { API_URL_IS_FIXED } from '../state/apiUrl';
import { ApiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

export function LoginScreen() {
  const { signIn, apiUrl } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);

    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }

    setBusy(true);
    try {
      await signIn(username.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>AadarBahar</Text>
        <Text style={styles.subtitle}>Game nights, buy-ins and who owes whom.</Text>
      </View>

      <Card style={styles.card}>
        <TextField
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          placeholder="ravi"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          placeholder="••••••••"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Sign in" onPress={submit} loading={busy} />
      </Card>

      <InstallCard />

      {API_URL_IS_FIXED ? null : (
        <Pressable
          onPress={() => navigation.navigate('ServerSettings')}
          style={styles.serverLink}
          hitSlop={8}
        >
          <Text style={styles.serverLabel}>Server</Text>
          <Text style={styles.serverValue} numberOfLines={1}>
            {apiUrl}
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', flexGrow: 1, padding: spacing(5) },
  hero: { alignItems: 'center', marginBottom: spacing(7) },
  logo: { width: 84, height: 84, borderRadius: radius.xl, marginBottom: spacing(4) },
  title: { ...font.display, color: colors.felt },
  subtitle: {
    ...font.body,
    color: colors.inkMuted,
    marginTop: spacing(1.5),
    textAlign: 'center',
  },
  card: { gap: 0 },
  error: {
    ...font.small,
    color: colors.loss,
    marginBottom: spacing(3),
    marginTop: -spacing(1),
  },
  serverLink: { marginTop: spacing(6), alignItems: 'center' },
  serverLabel: { ...font.caption, color: colors.inkFaint },
  serverValue: { ...font.small, color: colors.felt, marginTop: 2 },
});
