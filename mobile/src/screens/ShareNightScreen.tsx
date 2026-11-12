import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar, Button, Card, ErrorNotice, LoadingView, SectionHeader } from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { buildNightSummary, canSummarize } from '../utils/summary';
import { sendViaWhatsApp } from '../utils/whatsapp';
import { displayPhone } from '../utils/phone';
import { notify } from '../utils/dialog';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Game, Player } from '../api/types';

/**
 * Sends the night out on WhatsApp.
 *
 * Shows the message before it goes, because the app does not send it: WhatsApp
 * does, and whoever taps send is the one it comes from. Seeing the text first
 * is what makes that honest rather than surprising.
 */
export function ShareNightScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ShareNight'>>();
  const { gameId } = route.params;

  const { data, loading, error, refetch } = useApiQuery<{ game: Game }>(
    (client) => client.game(gameId),
    [gameId],
  );
  // The roster carries the phone numbers; the game only names who played.
  const roster = useApiQuery<{ players: Player[] }>((client) => client.players(true), []);

  const game = data?.game;

  if (loading && !game) return <LoadingView />;
  if (error && !game) {
    return (
      <Screen>
        <ErrorNotice message={error} onRetry={refetch} />
      </Screen>
    );
  }
  if (!game) return null;

  if (!canSummarize(game)) {
    return (
      <Screen>
        <Card style={styles.waiting}>
          <Ionicons name="time-outline" size={22} color={colors.feltSoft} />
          <Text style={styles.waitingText}>
            {game.players.length === 0
              ? 'Nobody has played this night yet.'
              : `${game.playersStillIn} still at the table. The summary is ready once everyone has cashed out — nothing is settled until then.`}
          </Text>
        </Card>
      </Screen>
    );
  }

  const message = buildNightSummary(game);
  const phoneByUser = new Map(
    (roster.data?.players ?? []).map((player) => [player.id, player.phone]),
  );
  const played = game.players.map((seat) => ({
    ...seat,
    phone: phoneByUser.get(seat.userId) ?? null,
  }));
  const reachable = played.filter((seat) => seat.phone);
  const unreachable = played.filter((seat) => !seat.phone);

  async function send(phone?: string | null) {
    const result = await sendViaWhatsApp(message, phone);
    if (result === 'failed') {
      notify('Could not open WhatsApp', 'Copy the summary across by hand instead.');
    }
  }

  return (
    <Screen
      footer={
        <Button
          label="Send to the group"
          icon="logo-whatsapp"
          onPress={() => void send()}
        />
      }
    >
      <Card style={styles.previewCard}>
        <View style={styles.previewHead}>
          <Ionicons name="logo-whatsapp" size={16} color={colors.win} />
          <Text style={styles.previewLabel}>What gets sent</Text>
        </View>
        {/* The asterisks are WhatsApp's bold markers - they disappear there. */}
        <Text style={styles.preview} selectable>
          {message}
        </Text>
      </Card>

      <Text style={styles.explainer}>
        <Text style={styles.strong}>Send to the group</Text> opens WhatsApp with this ready to go —
        pick the group and hit send. The app cannot send it for you, so nothing leaves until you
        tap send yourself.
      </Text>

      {reachable.length > 0 ? (
        <>
          <SectionHeader title={`Or send it to one person (${reachable.length})`} />
          <Card padded={false}>
            {reachable.map((seat, index) => (
              <Pressable
                key={seat.id}
                onPress={() => void send(seat.phone)}
                style={({ pressed }) => [
                  styles.personRow,
                  index < reachable.length - 1 && styles.divided,
                  pressed && styles.pressed,
                ]}
              >
                <Avatar name={seat.displayName} color={seat.avatarColor} size={32} />
                <View style={styles.personBody}>
                  <Text style={styles.personName}>{seat.displayName}</Text>
                  <Text style={styles.personPhone}>{displayPhone(seat.phone)}</Text>
                </View>
                <Ionicons name="logo-whatsapp" size={18} color={colors.win} />
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {unreachable.length > 0 ? (
        <>
          <SectionHeader title="No number on file" />
          <Card>
            <Text style={styles.muted}>
              {unreachable.map((seat) => seat.displayName).join(', ')}
              {unreachable.length === 1 ? ' has ' : ' have '}
              no mobile number yet, so there is nobody to send it to. The app asks for one the
              next time they sign in.
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewCard: { gap: spacing(2.5) },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  previewLabel: { ...font.caption, color: colors.inkFaint },
  preview: {
    ...font.small,
    color: colors.ink,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing(3),
  },

  explainer: {
    ...font.small,
    color: colors.inkMuted,
    lineHeight: 19,
    marginTop: spacing(4),
    paddingHorizontal: spacing(1),
  },
  strong: { ...font.smallStrong, color: colors.ink },

  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
  },
  personBody: { flex: 1 },
  personName: { ...font.bodyStrong, color: colors.ink },
  personPhone: { ...font.small, color: colors.inkFaint, marginTop: 1 },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pressed: { opacity: 0.6, backgroundColor: colors.surfaceMuted },

  waiting: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2.5) },
  waitingText: { ...font.small, color: colors.inkMuted, flex: 1, lineHeight: 20 },
  muted: { ...font.small, color: colors.inkMuted, lineHeight: 20 },
});
