import { splitEvenly, sum } from '../lib/money';

export interface LedgerPlayerInput {
  id: string;
  userId: string;
  displayName: string;
  buyIn: number;
  cashOut: number;
  isBanker: boolean;
}

export interface LedgerExpenseInput {
  id: string;
  type: string;
  amount: number;
  /** Who is chipping in. Empty for dinner, which falls on the top winner. */
  shareUserIds: string[];
}

export interface PlayerLedgerLine {
  userId: string;
  displayName: string;
  buyIn: number;
  cashOut: number;
  /** How they did at the table: cash-out minus cash-in, before any costs. */
  tableNet: number;
  /** Their slice of the night's costs. */
  expenseShare: number;
  /** What the night actually came to for them. */
  net: number;
  isBanker: boolean;
  /** Anyone who finishes ahead. There can be several. */
  isWinner: boolean;
  /** The single biggest table result. Dinner is on them. */
  isTopWinner: boolean;
}

export interface GameLedger {
  lines: PlayerLedgerLine[];
  topWinnerId: string | null;
  totals: {
    buyIn: number;
    cashOut: number;
    dinner: number;
    otherExpenses: number;
    expenses: number;
    /** buyIn - cashOut. Zero when the chips are all accounted for. */
    difference: number;
  };
  balanced: boolean;
}

/**
 * Who won the most at the table.
 *
 * Judged on the table result rather than the final net, and deliberately so:
 * dinner lands on this player, so working it out from a number that dinner has
 * already changed would chase its own tail. Ties break towards the bigger
 * cash-out, then the seat id, so the same game always names the same person.
 */
export function findTopWinner(players: LedgerPlayerInput[]): LedgerPlayerInput | null {
  if (players.length === 0) return null;

  return players.reduce((best, player) => {
    const bestNet = best.cashOut - best.buyIn;
    const net = player.cashOut - player.buyIn;
    if (net !== bestNet) return net > bestNet ? player : best;
    if (player.cashOut !== best.cashOut) return player.cashOut > best.cashOut ? player : best;
    return player.id < best.id ? player : best;
  });
}

/** Work out who carries how much of one cost. */
function shareOf(
  expense: LedgerExpenseInput,
  topWinnerId: string | null,
): Map<string, number> {
  const shares = new Map<string, number>();

  // Dinner is on whoever won the most. Not split, not negotiable.
  if (expense.type === 'DINNER') {
    if (topWinnerId) shares.set(topWinnerId, expense.amount);
    return shares;
  }

  // Everything else is carried by whoever put their hand up - one person, or
  // split evenly between several, to the paisa.
  const bearers = expense.shareUserIds;
  if (bearers.length === 0) return shares;

  const slices = splitEvenly(expense.amount, bearers.length);
  bearers.forEach((userId, index) => {
    shares.set(userId, (shares.get(userId) ?? 0) + (slices[index] ?? 0));
  });
  return shares;
}

/**
 * Work out the ledger for one game.
 *
 * Chips come from the banker and go back to the banker, so the buy-ins and the
 * cash-outs have to match. Costs are then taken off the people carrying them.
 */
export function computeGameLedger(
  players: LedgerPlayerInput[],
  expenses: LedgerExpenseInput[],
): GameLedger {
  const topWinner = findTopWinner(players);
  const topWinnerId = topWinner?.userId ?? null;

  const shareByUser = new Map<string, number>();
  for (const expense of expenses) {
    for (const [userId, amount] of shareOf(expense, topWinnerId)) {
      shareByUser.set(userId, (shareByUser.get(userId) ?? 0) + amount);
    }
  }

  const lines: PlayerLedgerLine[] = players.map((player) => {
    const tableNet = player.cashOut - player.buyIn;
    const expenseShare = shareByUser.get(player.userId) ?? 0;
    const net = tableNet - expenseShare;
    return {
      userId: player.userId,
      displayName: player.displayName,
      buyIn: player.buyIn,
      cashOut: player.cashOut,
      tableNet,
      expenseShare,
      net,
      isBanker: player.isBanker,
      // Finishing ahead is what counts as a win - after the night's costs.
      isWinner: net > 0,
      isTopWinner: player.userId === topWinnerId,
    };
  });

  const dinner = sum(expenses.filter((e) => e.type === 'DINNER').map((e) => e.amount));
  const otherExpenses = sum(expenses.filter((e) => e.type !== 'DINNER').map((e) => e.amount));
  const totalBuyIn = sum(players.map((p) => p.buyIn));
  const totalCashOut = sum(players.map((p) => p.cashOut));

  return {
    lines,
    topWinnerId,
    totals: {
      buyIn: totalBuyIn,
      cashOut: totalCashOut,
      dinner,
      otherExpenses,
      expenses: dinner + otherExpenses,
      difference: totalBuyIn - totalCashOut,
    },
    balanced: totalBuyIn - totalCashOut === 0,
  };
}
