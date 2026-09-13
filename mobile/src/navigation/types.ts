import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  GameDetail: { gameId: string };
  GameEditor: { gameId?: string };
  PlayerDetail: { playerId: string };
  AddPlayer: undefined;
  AddExpense: { gameId: string };
  RecordPayment: undefined;
  ChangePassword: { forced?: boolean } | undefined;
  ServerSettings: undefined;
  ManageRoster: undefined;
};

export type TabParamList = {
  Home: undefined;
  Games: undefined;
  Players: undefined;
  Settle: undefined;
  Profile: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
