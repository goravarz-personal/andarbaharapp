import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Maps screens to URLs. On the web build this makes the address bar
 * meaningful and lets a refresh land you back where you were; on a phone it
 * makes aadarbahar:// links open the right screen.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['aadarbahar://'],
  config: {
    screens: {
      Login: 'login',
      Tabs: {
        screens: {
          Home: '',
          Games: 'games',
          Players: 'players',
          Profile: 'you',
        },
      },
      GameDetail: 'games/:gameId',
      GameEditor: 'games/edit',
      AddExpense: 'games/:gameId/expense',
      PlayerDetail: 'players/:playerId',
      AddPlayer: 'players/new',
      ManageRoster: 'roster',
      ChangePassword: 'password',
      ServerSettings: 'server',
    },
  },
};
