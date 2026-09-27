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
  /** buyIn - cashOut. Only meaningful once everyone has cashed out. */
  difference: number;
}

/** One trip to the banker for chips. */
export interface BuyIn {
  id: string;
  amount: number;
  at: string;
}

export interface GamePlayerLine {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string | null;
  joinedAt: string;
  /** Every trip to the banker. */
  buyIns: BuyIn[];
  /** All of them added up. */
  buyIn: number;
  /** What they walked away with. Null while they are still playing. */
  cashOut: number | null;
  cashedOutAt: string | null;
  isPlaying: boolean;
  isBanker: boolean;
  notes: string | null;
  tableNet: number | null;
  expenseShare: number;
  /** What the night came to for them. Null while still playing. */
  net: number | null;
  isWinner: boolean;
  isTopWinner: boolean;
}

export interface Expense {
  id: string;
  type: ExpenseType;
  label: string | null;
  amount: number;
  at: string;
  /** Who went out and spent the money. */
  paidBy: PersonRef | null;
  /** Who is carrying it. Dinner names the top winner; others name who chipped in. */
  carriedBy: Array<{ userId: string; displayName: string }>;
}

/** What the top winner still owes whoever bought the food. */
export interface DinnerDebt {
  amount: number;
  to: { userId: string; displayName: string };
}

export interface GameSummary {
  id: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  playerCount: number;
  totals: GameTotals;
  balanced: boolean;
  complete: boolean;
  playersStillIn: number;
  topWinner: { userId: string; displayName: string } | null;
  players: Array<{
    userId: string;
    displayName: string;
    avatarColor: string | null;
    net: number | null;
    isPlaying: boolean;
  }>;
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
  complete: boolean;
  playersStillIn: number;
  dinnerDebts: DinnerDebt[];
  banker: { userId: string; displayName: string } | null;
  topWinner: {
    userId: string;
    displayName: string;
    net: number | null;
    tableNet: number | null;
  } | null;
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

/** Seating someone: an existing player, or one created on the spot. */
export interface SeatPlayerInput {
  userId?: string;
  newPlayer?: { username: string; displayName: string; phone?: string; email?: string };
  buyIn?: number;
  isBanker?: boolean;
}

export interface ExpenseInput {
  type: ExpenseType;
  amount: number;
  label?: string;
  /** Who went out and spent the money. */
  paidById?: string;
  /** Who is chipping in. Left out for dinner - that lands on the top winner. */
  shareUserIds?: string[];
}
