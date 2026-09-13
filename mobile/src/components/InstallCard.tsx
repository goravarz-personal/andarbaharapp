import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from './index';
import { useInstallState } from '../state/useInstall';
import { colors, font, radius, spacing } from '../theme';

/**
 * Turns "open this link" into "the app is on my home screen", which is the
 * whole point for anyone who was sent the link by a friend.
 */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const state = useInstallState();
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  if (state.kind === 'none') return null;

  // Android and desktop Chrome: the browser lets us do it in one tap.
  if (state.kind === 'prompt') {
    return (
      <Card style={styles.card}>
        <View style={styles.head}>
          <View style={styles.icon}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.felt} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.title}>Put this on your home screen</Text>
            <Text style={styles.subtitle}>
              Opens like a normal app, no browser bars, works the same.
            </Text>
          </View>
        </View>
        <Button
          label="Install app"
          icon="download-outline"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await state.install();
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    );
  }

  // iPhone and iPad: Apple only allows this through the Share menu.
  if (state.kind === 'ios') {
    return (
      <Card style={styles.card}>
        <Pressable onPress={() => setShowSteps((open) => !open)} style={styles.head}>
          <View style={styles.icon}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.felt} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.title}>Put this on your home screen</Text>
            <Text style={styles.subtitle}>Two taps. Then it opens like a normal app.</Text>
          </View>
          <Ionicons
            name={showSteps ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.inkFaint}
          />
        </Pressable>

        {showSteps ? (
          <View style={styles.steps}>
            <Step number={1}>
              Tap <Ionicons name="share-outline" size={15} color={colors.felt} /> at the bottom of
              Safari
            </Step>
            <Step number={2}>
              Scroll down and tap <Text style={styles.strong}>Add to Home Screen</Text>
            </Step>
            <Step number={3}>
              Tap <Text style={styles.strong}>Add</Text> in the top corner
            </Step>
            <Text style={styles.note}>
              If you are in Chrome, open this page in Safari first — only Safari can add apps to
              the iPhone home screen.
            </Text>
          </View>
        ) : null}
      </Card>
    );
  }

  // Android, before Chrome has decided to offer its own install event.
  if (state.kind === 'android') {
    return (
      <Card style={styles.card}>
        <Pressable onPress={() => setShowSteps((open) => !open)} style={styles.head}>
          <View style={styles.icon}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.felt} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.title}>Put this on your home screen</Text>
            <Text style={styles.subtitle}>Two taps. Then it opens like a normal app.</Text>
          </View>
          <Ionicons
            name={showSteps ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.inkFaint}
          />
        </Pressable>

        {showSteps ? (
          <View style={styles.steps}>
            <Step number={1}>
              Tap <Ionicons name="ellipsis-vertical" size={15} color={colors.felt} /> in the top
              corner of Chrome
            </Step>
            <Step number={2}>
              Tap <Text style={styles.strong}>Install app</Text>, or{' '}
              <Text style={styles.strong}>Add to Home screen</Text>
            </Step>
          </View>
        ) : null}
      </Card>
    );
  }

  // A computer. Worth a line, not worth a fuss.
  if (compact) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="desktop-outline" size={18} color={colors.felt} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Keep this handy</Text>
          <Text style={styles.subtitle}>
            Your browser menu has an &quot;Install&quot; option for this page, so it opens in its
            own window.
          </Text>
        </View>
      </View>
    </Card>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing(4), gap: spacing(3) },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1 },
  title: { ...font.bodyStrong, color: colors.ink },
  subtitle: { ...font.small, color: colors.inkMuted, marginTop: 2, lineHeight: 18 },

  steps: {
    gap: spacing(3),
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing(3.5),
  },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(3) },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.felt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  stepText: { ...font.small, color: colors.ink, flex: 1, lineHeight: 20 },
  strong: { fontWeight: '700' },
  note: {
    ...font.small,
    color: colors.inkFaint,
    lineHeight: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    paddingTop: spacing(2.5),
  },
});
