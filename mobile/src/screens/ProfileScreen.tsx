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
  ErrorNotice,
  LoadingView,
  Money,
  Row,
  SectionHeader,
  TextField,
} from '../components';
import { useApiQuery } from '../state/useApiQuery';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from '../utils/money';
import { colors, font, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { confirm, notify } from '../utils/dialog';
import type { Balances, Player, PlayerStats } from '../api/types';

export function ProfileScreen() {
  const { api, user, apiUrl, isAdmin, signOut, refreshUser } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);

  const { data, loading, error, refreshing, refetch } = useApiQuery<{
    user: Player;
    stats: PlayerStats;
    balances: Balances;
  }>((client) => client.me());

  async function save() {
    setSaving(true);
    try {
      await api.updateMe({
        displayName: displayName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      await refreshUser();
      setEditing(false);
      refetch();
    } catch (caught) {
      notify('Could not save', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <Screen><ErrorNotice message={error} onRetry={refetch} /></Screen>;

  const stats = data?.stats;
  const balances = data?.balances;

  return (
    <Screen onRefresh={refetch} refreshing={refreshing}>
      <Card style={styles.head}>
        <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor} size={64} />
        <View style={styles.headText}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.displayName}</Text>
            {isAdmin ? <Badge label="Admin" tone="felt" /> : null}
          </View>
          <Text style={styles.username}>@{user?.username}</Text>
        </View>
      </Card>

      {stats && balances ? (
        <Card style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>LIFETIME</Text>
            <Money value={stats.netProfit} signed size="heading" />
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>GAMES</Text>
            <Text style={styles.summaryValue}>{stats.gamesPlayed}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>SETTLE UP</Text>
            <Money value={balances.net} signed size="heading" />
          </View>
        </Card>
      ) : null}

      <SectionHeader
        title="Your details"
        action={editing ? 'Cancel' : 'Edit'}
        onAction={() => {
          setDisplayName(user?.displayName ?? '');
          setPhone(user?.phone ?? '');
          setEmail(user?.email ?? '');
          setEditing((open) => !open);
        }}
      />

      {editing ? (
        <Card>
          <TextField label="Name" value={displayName} onChangeText={setDisplayName} />
          <TextField
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Optional"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Optional"
          />
          <Button label="Save" onPress={save} loading={saving} />
        </Card>
      ) : (
        <Card padded={false} style={styles.rows}>
          <Row title="Phone" subtitle={user?.phone ?? 'Not set'} />
          <Row title="Email" subtitle={user?.email ?? 'Not set'} last />
        </Card>
      )}

      <SectionHeader title="App" />
      <Card padded={false} style={styles.rows}>
        <Row
          title="Change password"
          subtitle="Pick a new one"
          left={<Ionicons name="key-outline" size={18} color={colors.feltSoft} />}
          onPress={() => navigation.navigate('ChangePassword')}
        />
        <Row
          title="Server"
          subtitle={apiUrl}
          left={<Ionicons name="cloud-outline" size={18} color={colors.feltSoft} />}
          onPress={() => navigation.navigate('ServerSettings')}
          last={!isAdmin}
        />
        {isAdmin ? (
          <Row
            title="Manage the roster"
            subtitle="Roles, passwords, who is still playing"
            left={<Ionicons name="shield-checkmark-outline" size={18} color={colors.feltSoft} />}
            onPress={() => navigation.navigate('ManageRoster')}
            last
          />
        ) : null}
      </Card>

      {balances && balances.totalOwes > 0 ? (
        <Text style={styles.reminder}>
          You still owe {formatMoney(balances.totalOwes)} across the group.
        </Text>
      ) : null}

      <Button
        label="Sign out"
        variant="ghost"
        icon="log-out-outline"
        style={styles.signOut}
        onPress={() =>
          confirm({
            title: 'Sign out?',
            message: 'You will need your password to get back in.',
            cancelLabel: 'Stay',
            confirmLabel: 'Sign out',
            destructive: true,
            onConfirm: () => void signOut(),
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  headText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  name: { ...font.title, color: colors.ink, flexShrink: 1 },
  username: { ...font.small, color: colors.inkMuted, marginTop: 2 },

  summary: { flexDirection: 'row', marginTop: spacing(3), alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: colors.line },
  summaryLabel: { ...font.caption, color: colors.inkFaint, fontSize: 10, marginBottom: 3 },
  summaryValue: { ...font.heading, color: colors.ink },

  rows: { paddingHorizontal: spacing(4) },
  reminder: {
    ...font.small,
    color: colors.warn,
    textAlign: 'center',
    marginTop: spacing(5),
  },
  signOut: { marginTop: spacing(4) },
});
