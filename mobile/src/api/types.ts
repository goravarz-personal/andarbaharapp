/** Mirrors what the API returns. Money is always whole paise. */

export type Role = 'ADMIN' | 'PLAYER';
export type GameStatus = 'OPEN' | 'SETTLED';
export type ExpenseCategory = 'DINNER' | 'OTHER';
export type SplitMode = 'EQUAL' | 'CUSTOM' | 'PAYER';
export type SettlementStatus = 'PENDING' | 'PAID';

export interface Player {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  avatarColor: string | null;
  createdAt: string;
}

export interface PersonRef {
  id: string;
  username: string;
  displayName: string;
  avatarColor?: string | null;
}

export interface GameTotals {
  buyIn: number;
  cashOut: number;
  dinner: number;
  otherExpenses: number;
  expenses: number;
  tableImbalance: number;
}

export interface GamePlayerLine {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string | null;
  buyIn: number;
  cashOut: number;
  isWinner: boolean;
  notes: string | null;
  tableNet: number;
  expensePaid: number;
  expenseShare: number;
  net: number;
}

export interface ExpenseShare {
  userId: string;
  displayName: string;
  amount: number;
}

export interface Expense {
  id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  splitMode: SplitMode;
  paidBy: PersonRef;
  shares: ExpenseShare[];
}

export interface Settlement {
  id: string;
  gameId: string | null;
  amount: number;
  status: SettlementStatus;
  kind: 'AUTO' | 'MANUAL';
  note: string | null;
  paidAt: string | null;
  createdAt: string;
  from: PersonRef;
  to: PersonRef;
}

export interface GameSummary {
  id: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  status: GameStatus;
  playerCount: number;
  totals: GameTotals;
  balanced: boolean;
  pendingSettlements: number;
  winners: Array<{ userId: string; displayName: string }>;
  players: Array<{ userId: string; displayName: string; avatarColor: string | null; net: number }>;
}

export interface Game {
  id: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: PersonRef;
  playerCount: number;
  players: GamePlayerLine[];
  expenses: Expense[];
  totals: GameTotals;
  balanced: boolean;
  winners: Array<{ userId: string; displayName: string; net: number }>;
  settlements: Settlement[];
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  winRate: number;
  totalBuyIn: number;
  totalCashOut: number;
  netProfit: number;
  bestGame: number;
  worstGame: number;
  averageNet: number;
  expensesPaid: number;
  expenseShare: number;
  lastPlayedOn: string | null;
}

export interface HistoryRow {
  gameId: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  status: GameStatus;
  playerCount: number;
  buyIn: number;
  cashOut: number;
  tableNet: number;
  expensePaid: number;
  expenseShare: number;
  net: number;
  isWinner: boolean;
}

export interface BalanceEntry {
  person?: PersonRef;
  amount: number;
}

export interface Balances {
  owes: BalanceEntry[];
  owed: BalanceEntry[];
  totalOwes: number;
  totalOwed: number;
  net: number;
}

export interface Dashboard {
  stats: PlayerStats;
  balances: Balances;
  totals: { games: number; players: number };
  recentGames: GameSummary[];
}

export interface LeaderboardRow extends PersonRef {
  role: Role;
  stats: PlayerStats;
}

export interface OutstandingRow {
  amount: number;
  from: PersonRef | null;
  to: PersonRef | null;
}

/** Shapes sent to the API when recording a game. */
export interface GamePlayerInput {
  userId: string;
  buyIn?: number;
  cashOut?: number;
  isWinner?: boolean;
  notes?: string;
}

export interface ExpenseInput {
  label: string;
  amount: number;
  category: ExpenseCategory;
  paidById: string;
  splitMode: SplitMode;
  shares?: Array<{ userId: string; amount: number }>;
}
