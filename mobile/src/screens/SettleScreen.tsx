import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  LoadingView,
  SectionHeader,
  SegmentedControl,
} from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from '../utils/money';
import { formatRelative } from '../utils/date';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { notify } from '../utils/dialog';
import type { OutstandingRow, Settlement } from '../api/types';

type View_ = 'MINE' | 'EVERYONE';

/** The "who owes whom" board, and the place to tick payments off. */
export function SettleScreen() {
  const { api, user, isAdmin } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [scope, setScope] = useState<View_>('MINE');
  const [working, setWorking] = useState<string | null>(null);

  const { data, loading, error, refreshing, refetch } = useApiQuery<{
    outstanding: OutstandingRow[];
    settlements: Settlement[];
  }>(async (client) => {
    const [outstanding, settlements] = await Promise.all([
      client.outstanding(),
      client.settlements({ status: 'PENDING' }),
    ]);
    return { outstanding: outstanding.outstanding, settlements: settlements.settlements };
  });

  async function markPaid(settlement: Settlement) {
    setWorking(settlement.id);
    try {
      await api.markSettlement(settlement.id, 'PAID');
      refetch();
    } catch (caught) {
      notify('Could not mark it paid', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setWorking(null);
    }
  }

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <Screen><ErrorNotice message={error} onRetry={refetch} /></Screen>;

  const outstanding = data?.outstanding ?? [];
  const settlements = data?.settlements ?? [];

  const visibleBoard =
    scope === 'MINE'
      ? outstanding.filter((row) => row.from?.id === user?.id || row.to?.id === user?.id)
      : outstanding;

  const visiblePayments =
    scope === 'MINE'
      ? settlements.filter((row) => row.from.id === user?.id || row.to.id === user?.id)
      : settlements;

  return (
    <Screen
      onRefresh={refetch}
      refreshing={refreshing}
      footer={
        isAdmin ? (
          <Button
            label="Record a payment between players"
            icon="swap-horizontal"
            variant="secondary"
            onPress={() => navigation.navigate('RecordPayment')}
          />
        ) : undefined
      }
    >
      <SegmentedControl<View_>
        value={scope}
        onChange={setScope}
        options={[
          { value: 'MINE', label: 'Mine' },
          { value: 'EVERYONE', label: 'Everyone' },
        ]}
      />

      <SectionHeader title="Who owes whom" />
      {visibleBoard.length === 0 ? (
        <Card>
          <EmptyState
            icon="checkmark-done-outline"
            title="All square"
            message={
              scope === 'MINE'
                ? 'You do not owe anyone, and nobody owes you.'
                : 'Nothing outstanding across the group.'
            }
          />
        </Card>
      ) : (
        <View style={styles.board}>
          {visibleBoard.map((row, index) => {
            const iOwe = row.from?.id === user?.id;
            const owedToMe = row.to?.id === user?.id;
            return (
              <Card
                key={`${row.from?.id}-${row.to?.id}-${index}`}
                style={[
                  styles.boardCard,
                  iOwe && styles.boardOwe,
                  owedToMe && styles.boardOwed,
                ]}
              >
                <Avatar name={row.from?.displayName ?? '?'} color={row.from?.avatarColor} size={34} />
                <Ionicons name="arrow-forward" size={15} color={colors.inkFaint} />
                <Avatar name={row.to?.displayName ?? '?'} color={row.to?.avatarColor} size={34} />
                <View style={styles.boardBody}>
                  <Text style={styles.boardText} numberOfLines={2}>
                    <Text style={styles.boardName}>
                      {iOwe ? 'You' : (row.from?.displayName ?? 'Someone')}
                    </Text>
                    {' owe'}
                    {iOwe ? '' : 's'}{' '}
                    <Text style={styles.boardName}>
                      {owedToMe ? 'you' : (row.to?.displayName ?? 'someone')}
                    </Text>
                  </Text>
                </View>
                <Text style={[styles.boardAmount, iOwe && styles.amountOwe, owedToMe && styles.amountOwed]}>
                  {formatMoney(row.amount)}
                </Text>
              </Card>
            );
          })}
        </View>
      )}

      <SectionHeader title="Payments still to make" />
      {visiblePayments.length === 0 ? (
        <Card>
          <Text style={styles.muted}>Nothing pending.</Text>
        </Card>
      ) : (
        <Card padded={false}>
          {visiblePayments.map((settlement, index) => {
            const canConfirm = isAdmin || settlement.to.id === user?.id;
            return (
              <View
                key={settlement.id}
                style={[styles.payRow, index < visiblePayments.length - 1 && styles.divided]}
              >
                <View style={styles.payBody}>
                  <Text style={styles.payText} numberOfLines={1}>
                    <Text style={styles.payName}>
                      {settlement.from.id === user?.id ? 'You' : settlement.from.displayName}
                    </Text>
                    {' → '}
                    <Text style={styles.payName}>
                      {settlement.to.id === user?.id ? 'you' : settlement.to.displayName}
                    </Text>
                  </Text>
                  <Text style={styles.payMeta}>
                    {formatMoney(settlement.amount)} ·{' '}
                    {settlement.kind === 'MANUAL' ? 'recorded by hand' : 'from a game'} ·{' '}
                    {formatRelative(settlement.createdAt)}
                  </Text>
                  {settlement.note ? <Text style={styles.payNote}>{settlement.note}</Text> : null}
                </View>

                {canConfirm ? (
                  <Button
                    label="Mark paid"
                    variant="secondary"
                    onPress={() => void markPaid(settlement)}
                    loading={working === settlement.id}
                    style={styles.payAction}
                  />
                ) : (
                  <Badge label="Awaiting" tone="warn" />
                )}
              </View>
            );
          })}
        </Card>
      )}

      <Text style={styles.footnote}>
        The player receiving the money is the one who confirms it arrived. An admin can confirm any
        payment.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing(2) },
  boardCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), padding: spacing(3) },
  boardOwe: { borderColor: colors.loss, backgroundColor: colors.lossSoft },
  boardOwed: { borderColor: colors.win, backgroundColor: colors.winSoft },
  boardBody: { flex: 1, marginLeft: spacing(1) },
  boardText: { ...font.small, color: colors.inkMuted },
  boardName: { ...font.smallStrong, color: colors.ink },
  boardAmount: { ...font.heading, color: colors.ink },
  amountOwe: { color: colors.loss },
  amountOwed: { color: colors.win },

  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
  },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  payBody: { flex: 1 },
  payText: { ...font.body, color: colors.inkMuted },
  payName: { ...font.bodyStrong, color: colors.ink },
  payMeta: { ...font.small, color: colors.inkMuted, marginTop: 2 },
  payNote: { ...font.small, color: colors.inkFaint, marginTop: 2, fontStyle: 'italic' },
  payAction: { minHeight: 38, paddingHorizontal: spacing(3), borderRadius: radius.sm },

  muted: { ...font.small, color: colors.inkMuted },
  footnote: {
    ...font.small,
    color: colors.inkFaint,
    marginTop: spacing(5),
    lineHeight: 18,
    textAlign: 'center',
  },
});
