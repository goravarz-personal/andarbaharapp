import React, { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

/**
 * Standard page body: scrolls, pulls to refresh, keeps clear of the keyboard
 * and the home indicator.
 */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  contentStyle,
  footer,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned above the safe area - use for a primary action. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // The footer floats over the scroll view, so the content has to be padded by
  // however tall the footer turns out to be or the last row hides behind it.
  const [footerHeight, setFooterHeight] = useState(0);
  const bottomPad = spacing(6) + (footer ? footerHeight : insets.bottom);

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.felt} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, { paddingBottom: bottomPad }, contentStyle]}>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {body}
      {footer ? (
        <View
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing(3)) }]}
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(4) },
  footer: {
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
