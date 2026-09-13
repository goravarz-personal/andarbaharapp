/** Mirrors what the API returns. Money is always whole paise. */

export type Role = 'ADMIN' | 'PLAYER';

/** What the night spent money on. Dinner is the common case. */
export const EXPENSE_TYPES = [
  'DINNER',
  'DRINKS',
  'SNACKS',
  'CARDS',
  'VENUE',
  'TRAVEL',
  'OTHER',
] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  DINNER: 'Dinner',
  DRINKS: 'Drinks',
  SNACKS: 'Snacks',
  CARDS: 'Cards and supplies',
  VENUE: 'Venue',
  TRAVEL: 'Travel',
  OTHER: 'Something else',
};

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
  /** buyIn - cashOut - expenses. Zero when the night reconciles. */
  difference: number;
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
  net: number;
}

export interface Expense {
  id: string;
  type: ExpenseType;
  label: string | null;
  amount: number;
  paidBy: PersonRef;
}

export interface GameSummary {
  id: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  playerCount: number;
  totals: GameTotals;
  balanced: boolean;
  winner: { userId: string; displayName: string } | null;
  players: Array<{ userId: string; displayName: string; avatarColor: string | null; net: number }>;
}

export interface Game {
  id: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: PersonRef;
  playerCount: number;
  players: GamePlayerLine[];
  expenses: Expense[];
  totals: GameTotals;
  balanced: boolean;
  winner: { userId: string; displayName: string; net: number } | null;
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
  lastPlayedOn: string | null;
}

export interface HistoryRow {
  gameId: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  playerCount: number;
  buyIn: number;
  cashOut: number;
  net: number;
  isWinner: boolean;
}

export interface Dashboard {
  stats: PlayerStats;
  totals: { games: number; players: number };
  recentGames: GameSummary[];
}

export interface LeaderboardRow extends PersonRef {
  role: Role;
  stats: PlayerStats;
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
  type: ExpenseType;
  amount: number;
  label?: string;
  /** Left out for dinner - the server puts that on the winner. */
  paidById?: string;
}
