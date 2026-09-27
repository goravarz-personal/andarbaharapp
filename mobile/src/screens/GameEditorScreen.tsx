import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Button, Card, ErrorNotice, LoadingView, TextField } from '../components';
import { useAuth } from '../state/AuthContext';
import { fromDateInput, formatDate, shiftDays, toDateInput, todayInput } from '../utils/date';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { confirm, notify } from '../utils/dialog';

const DEFAULT_LOCATION = 'Katte Room';

/** "Saturday-Regular" - what the nights are actually called. */
function defaultTitleFor(dateInput: string): string {
  const iso = fromDateInput(dateInput);
  if (!iso) return '';
  const day = new Date(iso).toLocaleDateString('en-GB', { weekday: 'long' });
  return `${day}-Regular`;
}

/**
 * Opens a game night - the date, the name, where it is being played.
 *
 * Nothing about the play itself is entered here. Players are seated on the
 * game's own screen as they turn up, buy in as often as they like and cash out
 * once, so there is no form to fill in before the cards come out.
 */
export function GameEditorScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'GameEditor'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api } = useAuth();
  const gameId = route.params?.gameId;
  const isEditing = Boolean(gameId);

  const [playedOn, setPlayedOn] = useState(todayInput());
  const [title, setTitle] = useState(() => defaultTitleFor(todayInput()));
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [notes, setNotes] = useState('');
  /** Once the name has been typed over, stop following the date. */
  const [titleEdited, setTitleEdited] = useState(false);

  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit the night' : 'Start a game night' });
  }, [navigation, isEditing]);

  const load = React.useCallback(async () => {
    if (!gameId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { game } = await api.game(gameId);
      setPlayedOn(toDateInput(game.playedOn));
      setTitle(game.title ?? '');
      setLocation(game.location ?? '');
      setNotes(game.notes ?? '');
      setTitleEdited(true);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [api, gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Following the date, unless the name has been typed over. */
  function pickDate(next: string) {
    setPlayedOn(next);
    if (!titleEdited) setTitle(defaultTitleFor(next));
  }

  async function save() {
    setError(null);

    const when = fromDateInput(playedOn);
    if (!when) return setError('Enter the date as YYYY-MM-DD.');

    setSaving(true);
    try {
      if (isEditing && gameId) {
        await api.updateGame(gameId, {
          playedOn: when,
          title: title.trim(),
          location: location.trim(),
          notes: notes.trim(),
        });
        navigation.goBack();
        return;
      }

      const { game } = await api.createGame({
        playedOn: when,
        title: title.trim() || undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      // Straight to the table, which is where the night actually gets recorded.
      navigation.replace('GameDetail', { gameId: game.id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the game.');
    } finally {
      setSaving(false);
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

  return (
    <Screen
      footer={
        <Button
          label={isEditing ? 'Save changes' : 'Open the table'}
          onPress={save}
          loading={saving}
        />
      }
    >
      <Card>
        <TextField
          label="Date played"
          value={playedOn}
          onChangeText={pickDate}
          placeholder={todayInput()}
          autoCapitalize="none"
          hint={
            fromDateInput(playedOn)
              ? formatDate(fromDateInput(playedOn) as string)
              : 'Type it as YYYY-MM-DD'
          }
        />
        {/* Most games are opened the same night, or written up the morning after. */}
        <View style={styles.quickDates}>
          {[
            { label: 'Today', value: todayInput() },
            { label: 'Yesterday', value: shiftDays(todayInput(), -1) },
            { label: '2 days ago', value: shiftDays(todayInput(), -2) },
          ].map((option) => (
            <Pressable
              key={option.label}
              onPress={() => pickDate(option.value)}
              style={[styles.quickDate, playedOn === option.value && styles.quickDateOn]}
            >
              <Text
                style={[styles.quickDateText, playedOn === option.value && styles.quickDateTextOn]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextField
          label="Name this night"
          value={title}
          onChangeText={(next) => {
            setTitleEdited(true);
            setTitle(next);
          }}
          placeholder={defaultTitleFor(playedOn)}
        />
        <TextField
          label="Where"
          value={location}
          onChangeText={setLocation}
          placeholder={DEFAULT_LOCATION}
        />
        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering about the night"
          multiline
          style={styles.lastField}
        />
      </Card>

      {!isEditing ? (
        <Text style={styles.hint}>
          Players are seated on the game&apos;s own screen — add them as they turn up, with whatever
          they buy in for. They can buy more chips any number of times; cashing out happens once.
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isEditing && gameId ? (
        <Button
          label="Delete this game"
          variant="danger"
          style={styles.deleteButton}
          onPress={() =>
            confirm({
              title: 'Delete this game?',
              message: 'This cannot be undone.',
              cancelLabel: 'Keep it',
              confirmLabel: 'Delete',
              destructive: true,
              onConfirm: async () => {
                try {
                  await api.deleteGame(gameId);
                  navigation.navigate('Tabs', { screen: 'Games' });
                } catch (caught) {
                  notify(
                    'Could not delete',
                    caught instanceof Error ? caught.message : 'Please try again.',
                  );
                }
              },
            })
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quickDates: {
    flexDirection: 'row',
    gap: spacing(2),
    marginTop: -spacing(2),
    marginBottom: spacing(4),
  },
  quickDate: {
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickDateOn: { backgroundColor: colors.felt, borderColor: colors.felt },
  quickDateText: { ...font.small, color: colors.inkMuted, fontWeight: '600' },
  quickDateTextOn: { color: colors.white },

  lastField: { marginBottom: 0 },
  hint: { ...font.small, color: colors.inkFaint, marginTop: spacing(4), lineHeight: 19 },
  error: { ...font.small, color: colors.loss, marginTop: spacing(3) },
  deleteButton: { marginTop: spacing(6) },
});
