import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { ErrorNotice, LoadingView } from '../components';
import { ExpenseForm } from '../components/ExpenseForm';
import { useAuth } from '../state/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import type { ExpensePerson } from '../components/ExpenseForm';

export function AddExpenseScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AddExpense'>>();
  const navigation = useNavigation();
  const { api } = useAuth();
  const { gameId } = route.params;

  const [players, setPlayers] = useState<ExpensePerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const { game } = await api.game(gameId);
      setPlayers(
        game.players.map((player) => ({
          userId: player.userId,
          displayName: player.displayName,
          avatarColor: player.avatarColor,
          isWinner: player.isWinner,
        })),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the game.');
    }
  }, [api, gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Screen><ErrorNotice message={error} onRetry={() => void load()} /></Screen>;
  if (!players) return <LoadingView />;

  return (
    <Screen>
      <ExpenseForm
        players={players}
        submitLabel="Add to this game"
        busy={busy}
        onSubmit={async (input) => {
          setBusy(true);
          try {
            await api.addExpense(gameId, input);
            navigation.goBack();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not add the expense.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <Text />
    </Screen>
  );
}
