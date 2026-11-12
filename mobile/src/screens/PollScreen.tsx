import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Button, Card, SectionHeader, TextField } from '../components';
import { buildPollMessage, DEFAULT_POLL_OPTIONS } from '../utils/poll';
import { sendViaWhatsApp } from '../utils/whatsapp';
import { fromDateInput, formatDate, nextWeekday, shiftDays, todayInput } from '../utils/date';
import { notify } from '../utils/dialog';
import { colors, font, radius, spacing } from '../theme';

const DEFAULT_LOCATION = 'Katte Room';
const MAX_OPTIONS = 10;

/**
 * Asks the group who is coming to the next night.
 *
 * It writes a numbered message and hands it to WhatsApp. WhatsApp's own poll,
 * the one with the vote bars, can only be made inside WhatsApp - no link or
 * API creates one - so the replies come back as messages in the group thread
 * rather than as a tally here. Counting them is still a human job for now.
 */
export function PollScreen() {
  const [playedOn, setPlayedOn] = useState(() => nextWeekday(6));
  const [where, setWhere] = useState(DEFAULT_LOCATION);
  const [question, setQuestion] = useState('Who is in?');
  const [options, setOptions] = useState<string[]>(DEFAULT_POLL_OPTIONS);
  const [error, setError] = useState<string | null>(null);

  const iso = fromDateInput(playedOn);
  const filled = options.map((option) => option.trim()).filter(Boolean);

  const preview = iso
    ? buildPollMessage({ playedOn: iso, where, question, options })
    : null;

  function setOption(index: number, value: string) {
    setOptions((current) => current.map((option, at) => (at === index ? value : option)));
  }

  function addOption() {
    setOptions((current) =>
      current.length >= MAX_OPTIONS ? current : [...current, ''],
    );
  }

  function removeOption(index: number) {
    setOptions((current) => current.filter((_, at) => at !== index));
  }

  async function send() {
    setError(null);
    if (!iso) return setError('Enter the date as YYYY-MM-DD.');
    if (filled.length < 2) return setError('Give them at least two things to pick from.');

    const result = await sendViaWhatsApp(buildPollMessage({ playedOn: iso, where, question, options }));
    if (result === 'failed') {
      notify('Could not open WhatsApp', 'Copy the message across by hand instead.');
    }
  }

  return (
    <Screen
      footer={<Button label="Send to a group" icon="logo-whatsapp" onPress={() => void send()} />}
    >
      <Card>
        <TextField
          label="Which night"
          value={playedOn}
          onChangeText={setPlayedOn}
          placeholder={todayInput()}
          autoCapitalize="none"
          hint={iso ? formatDate(iso) : 'Type it as YYYY-MM-DD'}
        />
        <View style={styles.quickDates}>
          {[
            { label: 'Friday', value: nextWeekday(5) },
            { label: 'Saturday', value: nextWeekday(6) },
            { label: 'Tomorrow', value: shiftDays(todayInput(), 1) },
          ].map((option) => (
            <Pressable
              key={option.label}
              onPress={() => setPlayedOn(option.value)}
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
          label="Where"
          value={where}
          onChangeText={setWhere}
          placeholder={DEFAULT_LOCATION}
        />
        <TextField
          label="What to ask"
          value={question}
          onChangeText={setQuestion}
          placeholder="Who is in?"
          style={styles.lastField}
        />
      </Card>

      <SectionHeader
        title={`Options (${filled.length})`}
        action={options.length < MAX_OPTIONS ? 'Add one' : undefined}
        onAction={options.length < MAX_OPTIONS ? addOption : undefined}
      />
      <Card style={styles.optionsCard}>
        {options.map((option, index) => (
          <View key={index} style={styles.optionRow}>
            <Text style={styles.optionNumber}>{index + 1}</Text>
            <TextField
              label=""
              value={option}
              onChangeText={(next) => setOption(index, next)}
              placeholder="Something they can pick"
              style={styles.optionField}
            />
            <Pressable
              onPress={() => removeOption(index)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Remove option ${index + 1}`}
            >
              <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
            </Pressable>
          </View>
        ))}
        {options.length === 0 ? (
          <Text style={styles.muted}>No options yet — add a couple for them to pick from.</Text>
        ) : null}
      </Card>

      {preview ? (
        <>
          <SectionHeader title="What gets sent" />
          <Card>
            <Text style={styles.preview} selectable>
              {preview}
            </Text>
          </Card>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.explainer}>
        Replies come back in the group chat, not here. If you would rather have WhatsApp&apos;s own
        poll with the vote bars, make it with the <Text style={styles.strong}>+</Text> button inside
        WhatsApp — no app can create one of those from outside.
      </Text>
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
  optionsCard: { gap: spacing(2) },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  optionNumber: { ...font.smallStrong, color: colors.inkFaint, width: 14 },
  optionField: { flex: 1, marginBottom: 0 },

  preview: {
    ...font.small,
    color: colors.ink,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },

  muted: { ...font.small, color: colors.inkMuted },
  error: { ...font.small, color: colors.loss, marginTop: spacing(3) },
  explainer: {
    ...font.small,
    color: colors.inkFaint,
    lineHeight: 19,
    marginTop: spacing(5),
    paddingHorizontal: spacing(1),
  },
  strong: { ...font.smallStrong, color: colors.ink },
});
