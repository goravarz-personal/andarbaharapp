import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import {
  Avatar,
  Button,
  Card,
  ErrorNotice,
  LoadingView,
  SectionHeader,
  SegmentedControl,
  TextField,
} from '../components';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../api/client';
import { parseRupees } from '../utils/money';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Game, Player } from '../api/types';

type Source = 'roster' | 'new';

/**
 * Sits somebody down at a game already in progress.
 *
 * Someone who has never played before can be added from right here - a friend
 * turning up at ten o'clock should not mean leaving the table to set up an
 * account first. They get their own login, and the password to pass on.
 */
export function AddToGameScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AddToGame'>>();
  const navigation = useNavigation();
  const { api } = useAuth();
  const { gameId } = route.params;

  const [source, setSource] = useState<Source>('roster');
  const [roster, setRoster] = useState<Player[]>([]);
  const [seated, setSeated] = useState<Set<string>>(new Set());
  const [pickedId, setPickedId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');

  const [buyIn, setBuyIn] = useState('');
  const [isBanker, setIsBanker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(
    null,
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [{ players }, { game }] = await Promise.all([api.players(), api.game(gameId)]);
      setRoster(players);
      setSeated(new Set(game.players.map((player) => player.userId)));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Could not load the roster.');
    } finally {
      setLoading(false);
    }
  }, [api, gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = useMemo(
    () => roster.filter((player) => player.isActive && !seated.has(player.id)),
    [roster, seated],
  );

  // Nobody left on the roster to add means there is only one sensible tab.
  useEffect(() => {
    if (!loading && available.length === 0) setSource('new');
  }, [loading, available.length]);

  async function submit() {
    setError(null);
    setFieldErrors({});

    const amount = parseRupees(buyIn);
    if (amount === null) return setFieldErrors({ buyIn: 'Check the amount.' });

    let body: Parameters<typeof api.seatPlayer>[1];

    if (source === 'roster') {
      if (!pickedId) return setError('Pick who is sitting down.');
      body = { userId: pickedId, buyIn: amount, isBanker };
    } else {
      const name = displayName.trim();
      if (!name) return setFieldErrors({ displayName: 'What is their name?' });
      const handle = (username.trim() || name.split(' ')[0] || '').toLowerCase();
      if (handle.length < 3) {
        return setFieldErrors({ username: 'Pick a username of at least 3 characters.' });
      }
      body = {
        newPlayer: { username: handle, displayName: name, phone: phone.trim() || undefined },
        buyIn: amount,
        isBanker,
      };
    }

    setBusy(true);
    try {
      const response: { game: Game; temporaryPassword: string | null } = await api.seatPlayer(
        gameId,
        body,
      );

      // A brand-new player has a password that has to be handed over before
      // this screen closes, so it gets its own step.
      if (response.temporaryPassword) {
        const seat = response.game.players.find(
          (player) => player.username === body.newPlayer?.username,
        );
        setCreated({
          name: seat?.displayName ?? body.newPlayer?.displayName ?? 'They',
          username: seat?.username ?? body.newPlayer?.username ?? '',
          password: response.temporaryPassword,
        });
        return;
      }

      navigation.goBack();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields) setFieldErrors(caught.fields);
      setError(caught instanceof Error ? caught.message : 'Could not seat them.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingView />;
  if (loadError) {
    return (
      <Screen>
        <ErrorNotice message={loadError} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (created) {
    return (
      <Screen footer={<Button label="Back to the table" onPress={() => navigation.goBack()} />}>
        <Card style={styles.doneCard}>
          <View style={styles.tick}>
            <Ionicons name="checkmark" size={26} color={colors.white} />
          </View>
          <Text style={styles.doneTitle}>{created.name} is at the table</Text>
          <Text style={styles.doneText}>
            Give them these details. The app asks them to pick their own password the first time they
            sign in.
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
                  `You're on the AndarBahar ledger.\n\n` +
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
    <Screen footer={<Button label="Sit them down" onPress={submit} loading={busy} icon="add" />}>
      <SegmentedControl<Source>
        value={source}
        onChange={setSource}
        options={[
          { value: 'roster', label: 'On the roster' },
          { value: 'new', label: 'Someone new' },
        ]}
      />

      {source === 'roster' ? (
        <>
          <SectionHeader title={`Who is joining (${available.length})`} />
          {available.length === 0 ? (
            <Card>
              <Text style={styles.muted}>
                Everyone on the roster is already at this table. Use
                <Text style={styles.strong}> Someone new</Text> for a first-timer.
              </Text>
            </Card>
          ) : (
            <Card padded={false}>
              {available.map((player, index) => {
                const picked = player.id === pickedId;
                return (
                  <Pressable
                    key={player.id}
                    onPress={() => setPickedId(player.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked }}
                    style={({ pressed }) => [
                      styles.pickRow,
                      index < available.length - 1 && styles.divided,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Avatar name={player.displayName} color={player.avatarColor} size={32} />
                    <View style={styles.pickBody}>
                      <Text style={styles.pickName}>{player.displayName}</Text>
                      <Text style={styles.pickHandle}>@{player.username}</Text>
                    </View>
                    <Ionicons
                      name={picked ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={picked ? colors.felt : colors.lineStrong}
                    />
                  </Pressable>
                );
              })}
            </Card>
          )}
        </>
      ) : (
        <>
          <SectionHeader title="Their details" />
          <Card>
            <TextField
              label="Name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Ravi Kumar"
              autoCapitalize="words"
              error={fieldErrors.displayName}
            />
            <TextField
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder={displayName.trim().split(' ')[0]?.toLowerCase() || 'ravi'}
              autoCapitalize="none"
              autoCorrect={false}
              error={fieldErrors.username}
              hint="What they type to sign in. Leave it blank to use their first name."
            />
            <TextField
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+91 98765 43210"
              error={fieldErrors.phone}
              style={styles.lastField}
            />
          </Card>
        </>
      )}

      <SectionHeader title="Starting chips" />
      <Card>
        <TextField
          label="Buy-in (₹)"
          value={buyIn}
          onChangeText={setBuyIn}
          keyboardType="decimal-pad"
          placeholder="1000"
          error={fieldErrors.buyIn}
          hint="What they bought from the banker to sit down. More can be added any time."
        />
        <Pressable
          onPress={() => setIsBanker((current) => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isBanker }}
          style={styles.bankerRow}
        >
          <Ionicons
            name={isBanker ? 'checkbox' : 'square-outline'}
            size={20}
            color={isBanker ? colors.felt : colors.lineStrong}
          />
          <View style={styles.bankerText}>
            <Text style={styles.bankerLabel}>They are the banker tonight</Text>
            <Text style={styles.bankerHint}>Holds the cash, sells the chips, pays out at the end.</Text>
          </View>
        </Pressable>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.credentialLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.credentialValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { ...font.small, color: colors.inkMuted, lineHeight: 20 },
  strong: { ...font.smallStrong, color: colors.ink },
  lastField: { marginBottom: 0 },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pressed: { opacity: 0.6, backgroundColor: colors.surfaceMuted },

  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
  },
  pickBody: { flex: 1 },
  pickName: { ...font.bodyStrong, color: colors.ink },
  pickHandle: { ...font.small, color: colors.inkFaint, marginTop: 1 },

  bankerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(2.5),
    paddingTop: spacing(1),
  },
  bankerText: { flex: 1 },
  bankerLabel: { ...font.bodyStrong, color: colors.ink },
  bankerHint: { ...font.small, color: colors.inkFaint, marginTop: 1, lineHeight: 18 },

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
  credentialLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10 },
  credentialValue: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 17,
    color: colors.felt,
    marginTop: 2,
  },
});
