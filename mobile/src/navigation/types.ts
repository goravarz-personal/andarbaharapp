import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  GameDetail: { gameId: string };
  GameEditor: { gameId?: string };
  /** Seating somebody at a game already under way. */
  AddToGame: { gameId: string };
  /** One player's buy-ins and cash-out for one night. */
  Seat: { gameId: string; seatId: string };
  PlayerDetail: { playerId: string };
  AddPlayer: undefined;
  AddExpense: { gameId: string };
  ChangePassword: { forced?: boolean } | undefined;
  /** Collecting the number the night's summary gets sent to. */
  AddPhone: { forced?: boolean } | undefined;
  /** The finished night, ready to send out on WhatsApp. */
  ShareNight: { gameId: string };
  /** Asking the group who is coming to the next one. */
  Poll: undefined;
  ServerSettings: undefined;
  ManageRoster: undefined;
};

export type TabParamList = {
  Home: undefined;
  Games: undefined;
  Players: undefined;
  Profile: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
