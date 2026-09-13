import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow, spacing } from '../theme';
import { formatMoney } from '../utils/money';

/** A white panel. Everything sits on one of these. */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const tint = {
    primary: colors.white,
    secondary: colors.felt,
    ghost: colors.inkMuted,
    danger: colors.loss,
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={17} color={tint} style={styles.buttonIcon} /> : null}
          <Text style={[styles.buttonLabel, { color: tint }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  hint,
  error,
  style,
  ...inputProps
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.inkFaint}
        {...inputProps}
        style={[styles.input, error ? styles.inputError : null, inputProps.multiline && styles.inputMultiline]}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Initials in a coloured circle. Colour is stable per player. */
export function Avatar({
  name,
  color,
  size = 40,
  badge,
}: {
  name: string;
  color?: string | null;
  size?: number;
  badge?: ReactNode;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.feltSoft },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials || '?'}</Text>
      </View>
      {badge ? <View style={styles.avatarBadge}>{badge}</View> : null}
    </View>
  );
}

/** Money, coloured by whether it is a gain or a loss. */
export function Money({
  value,
  signed = false,
  tone = 'auto',
  size = 'body',
  style,
}: {
  value: number;
  signed?: boolean;
  tone?: 'auto' | 'neutral' | 'win' | 'loss';
  size?: 'small' | 'body' | 'heading' | 'title' | 'display';
  style?: StyleProp<TextStyle>;
}) {
  const resolved =
    tone === 'auto' ? (value > 0 ? 'win' : value < 0 ? 'loss' : 'neutral') : tone;
  const color = { win: colors.win, loss: colors.loss, neutral: colors.ink }[resolved];

  return (
    <Text style={[font[size === 'small' ? 'smallStrong' : size === 'body' ? 'bodyStrong' : size], { color }, style]}>
      {formatMoney(value, { signed: signed && value > 0 })}
    </Text>
  );
}

export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'win' | 'loss' | 'warn' | 'felt';
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const palette = {
    neutral: { bg: colors.surfaceMuted, fg: colors.inkMuted },
    win: { bg: colors.winSoft, fg: colors.win },
    loss: { bg: colors.lossSoft, fg: colors.loss },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    felt: { bg: colors.felt, fg: colors.goldSoft },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={palette.fg} style={styles.badgeIcon} /> : null}
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  tone = 'neutral',
  caption,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'win' | 'loss';
  caption?: string;
}) {
  const color = { neutral: colors.ink, win: colors.win, loss: colors.loss }[tone];
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {caption ? <Text style={styles.statCaption}>{caption}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = 'albums-outline',
  title,
  message,
  action,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.feltSoft} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action && onAction ? (
        <Button label={action} onPress={onAction} variant="secondary" style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.felt} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={styles.errorCard}>
      <View style={styles.errorRow}>
        <Ionicons name="alert-circle" size={18} color={colors.loss} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

/** A tappable row with a chevron. */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  last = false,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <View style={[styles.row, !last && styles.rowDivided]}>
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? (
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} style={styles.rowChevron} />
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.rowPressed}>
      {content}
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  cardPadded: { padding: spacing(4) },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(2),
    marginTop: spacing(5),
  },
  sectionTitle: { ...font.caption, color: colors.inkFaint },
  sectionAction: { ...font.smallStrong, color: colors.felt },

  button: {
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(4),
  },
  button_primary: { backgroundColor: colors.felt },
  button_secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.felt },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: colors.lossSoft, borderWidth: 1, borderColor: colors.loss },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...font.bodyStrong },
  buttonIcon: { marginRight: spacing(2) },

  fieldWrap: { marginBottom: spacing(4) },
  fieldLabel: { ...font.smallStrong, color: colors.inkMuted, marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: colors.ink,
    minHeight: 48,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  inputError: { borderColor: colors.loss },
  fieldHint: { ...font.small, color: colors.inkFaint, marginTop: spacing(1) },
  fieldError: { ...font.small, color: colors.loss, marginTop: spacing(1) },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '700' },
  avatarBadge: { position: 'absolute', right: -4, bottom: -4 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  badgeIcon: { marginRight: 3 },
  badgeText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 },

  statTile: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing(3),
    minWidth: 92,
  },
  statLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10 },
  statValue: { fontSize: 19, fontWeight: '700', marginTop: spacing(1) },
  statCaption: { ...font.small, color: colors.inkFaint, marginTop: 2 },

  empty: { alignItems: 'center', paddingVertical: spacing(10), paddingHorizontal: spacing(6) },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(3),
  },
  emptyTitle: { ...font.heading, color: colors.ink, textAlign: 'center' },
  emptyMessage: {
    ...font.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing(1.5),
    lineHeight: 21,
  },
  emptyAction: { marginTop: spacing(5), alignSelf: 'stretch' },

  loading: { paddingVertical: spacing(12), alignItems: 'center' },
  loadingText: { ...font.small, color: colors.inkMuted, marginTop: spacing(2) },

  errorCard: { borderColor: colors.loss, gap: spacing(3) },
  errorRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'flex-start' },
  errorText: { ...font.body, color: colors.ink, flex: 1, lineHeight: 20 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(3) },
  rowDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowPressed: { opacity: 0.6 },
  rowLeft: { marginRight: spacing(3) },
  rowBody: { flex: 1, marginRight: spacing(2) },
  rowTitle: { ...font.bodyStrong, color: colors.ink },
  rowSubtitle: { ...font.small, color: colors.inkMuted, marginTop: 1 },
  rowChevron: { marginLeft: spacing(1.5) },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segment: { flex: 1, paddingVertical: spacing(2), borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { ...font.smallStrong, color: colors.inkMuted },
  segmentTextActive: { color: colors.felt },
});
