import { sum } from '../lib/money';

export interface LedgerPlayerInput {
  id: string;
  userId: string;
  displayName: string;
  buyIn: number;
  cashOut: number;
  isWinner: boolean;
}

export interface LedgerExpenseInput {
  id: string;
  type: string;
  amount: number;
  paidById: string;
}

export interface PlayerLedgerLine {
  userId: string;
  displayName: string;
  buyIn: number;
  cashOut: number;
  /** What the night did to them: cash-out minus buy-in. */
  net: number;
  isWinner: boolean;
}

export interface GameLedger {
  lines: PlayerLedgerLine[];
  totals: {
    buyIn: number;
    cashOut: number;
    dinner: number;
    otherExpenses: number;
    expenses: number;
    /**
     * buyIn - cashOut - expenses. Zero when the night reconciles; anything
     * else means a number was typed wrong.
     */
    difference: number;
  };
  balanced: boolean;
}

/**
 * Work out the ledger for one game.
 *
 * The money is all physically present at the table: everyone buys in, the
 * night's costs come out of the pot, and whatever is left is what people take
 * home. So the books balance when
 *
 *     total buy-in  =  total cash-out  +  expenses
 *
 * and a player's result is simply what they took home minus what they put in.
 * Nothing is owed afterwards, which is why there is no splitting to do here -
 * the cost of dinner is already reflected in the winner's smaller cash-out.
 */
export function computeGameLedger(
  players: LedgerPlayerInput[],
  expenses: LedgerExpenseInput[],
): GameLedger {
  const lines: PlayerLedgerLine[] = players.map((player) => ({
    userId: player.userId,
    displayName: player.displayName,
    buyIn: player.buyIn,
    cashOut: player.cashOut,
    net: player.cashOut - player.buyIn,
    isWinner: player.isWinner,
  }));

  const dinner = sum(expenses.filter((e) => e.type === 'DINNER').map((e) => e.amount));
  const otherExpenses = sum(expenses.filter((e) => e.type !== 'DINNER').map((e) => e.amount));
  const totalExpenses = dinner + otherExpenses;

  const totalBuyIn = sum(players.map((p) => p.buyIn));
  const totalCashOut = sum(players.map((p) => p.cashOut));
  const difference = totalBuyIn - totalCashOut - totalExpenses;

  return {
    lines,
    totals: {
      buyIn: totalBuyIn,
      cashOut: totalCashOut,
      dinner,
      otherExpenses,
      expenses: totalExpenses,
      difference,
    },
    balanced: difference === 0,
  };
}

/** Whoever won the night. The costs come out of their winnings. */
export function findWinnerId(players: Array<{ userId: string; isWinner: boolean }>): string | null {
  return players.find((player) => player.isWinner)?.userId ?? null;
}
