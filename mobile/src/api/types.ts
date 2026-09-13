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
  /** buyIn - cashOut. Zero when every chip is accounted for. */
  difference: number;
}

export interface GamePlayerLine {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string | null;
  /** Chips bought from the banker. */
  buyIn: number;
  /** Chips cashed back in, before the night's costs come off. */
  cashOut: number;
  isBanker: boolean;
  notes: string | null;
  tableNet: number;
  expenseShare: number;
  /** What the night actually came to for them. */
  net: number;
  isWinner: boolean;
  isTopWinner: boolean;
}

export interface Expense {
  id: string;
  type: ExpenseType;
  label: string | null;
  amount: number;
  /** Who is carrying it. Dinner names the top winner; others name who chipped in. */
  carriedBy: Array<{ userId: string; displayName: string }>;
}

export interface GameSummary {
  id: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  playerCount: number;
  totals: GameTotals;
  balanced: boolean;
  topWinner: { userId: string; displayName: string } | null;
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
  banker: { userId: string; displayName: string } | null;
  topWinner: { userId: string; displayName: string; net: number; tableNet: number } | null;
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
  tableNet: number;
  expenseShare: number;
  net: number;
  isWinner: boolean;
  isTopWinner: boolean;
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
  isBanker?: boolean;
  notes?: string;
}

export interface ExpenseInput {
  type: ExpenseType;
  amount: number;
  label?: string;
  /** Who is chipping in. Left out for dinner - that lands on the top winner. */
  shareUserIds?: string[];
}
