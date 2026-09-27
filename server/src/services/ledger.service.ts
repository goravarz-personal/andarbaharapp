import { splitEvenly, sum } from '../lib/money';

export interface LedgerPlayerInput {
  id: string;
  userId: string;
  displayName: string;
  /** Every trip to the banker, in the order they were made. */
  buyIns: Array<{ amount: number }>;
  /** What they walked away with. Null while they are still playing. */
  cashOut: number | null;
  isBanker: boolean;
}

export interface LedgerExpenseInput {
  id: string;
  type: string;
  amount: number;
  /** Who laid the money out, when that is known. */
  paidById: string | null;
  /** Who is chipping in. Empty for dinner, which falls on the top winner. */
  shareUserIds: string[];
}

export interface PlayerLedgerLine {
  userId: string;
  displayName: string;
  /** Everything they bought in for, added up. */
  buyIn: number;
  buyInCount: number;
  cashOut: number | null;
  /** Still at the table - no cash-out yet, so no result to speak of. */
  isPlaying: boolean;
  /** How they did at the table, before any costs. Null while still playing. */
  tableNet: number | null;
  expenseShare: number;
  /** What the night came to for them. Null while still playing. */
  net: number | null;
  isBanker: boolean;
  isWinner: boolean;
  isTopWinner: boolean;
}

/** What the top winner still has to hand over, and to whom. */
export interface DinnerDebt {
  toUserId: string;
  amount: number;
}

export interface GameLedger {
  lines: PlayerLedgerLine[];
  topWinnerId: string | null;
  /** True once every seated player has cashed out. */
  complete: boolean;
  playersStillIn: number;
  /**
   * Whoever won the most owes the people who bought the food. Anything they
   * bought themselves is already theirs and nets out.
   */
  dinnerDebts: DinnerDebt[];
  totals: {
    buyIn: number;
    cashOut: number;
    dinner: number;
    otherExpenses: number;
    expenses: number;
    /** buyIn - cashOut. Only meaningful once everyone has cashed out. */
    difference: number;
  };
  balanced: boolean;
}

function buyInTotal(player: LedgerPlayerInput): number {
  return sum(player.buyIns.map((entry) => entry.amount));
}

/**
 * Who won the most at the table.
 *
 * Only players who have cashed out can be judged, and only those who finished
 * ahead: somebody down on the night has not won anything, whatever everyone
 * else did, so mid-way through a night the first person to cash out at a loss
 * is not crowned by default. Until somebody is up there is no top winner, and
 * dinner has nobody to land on yet.
 *
 * Judged on the table result rather than the final net, deliberately: dinner
 * lands on this player, so working it out from a number dinner has already
 * changed would chase its own tail. Ties break towards the bigger cash-out,
 * then the seat id, so the same game always names the same person.
 */
export function findTopWinner(players: LedgerPlayerInput[]): LedgerPlayerInput | null {
  const finished = players.filter(
    (player) => player.cashOut !== null && player.cashOut - buyInTotal(player) > 0,
  );
  if (finished.length === 0) return null;

  return finished.reduce((best, player) => {
    const bestNet = (best.cashOut ?? 0) - buyInTotal(best);
    const net = (player.cashOut ?? 0) - buyInTotal(player);
    if (net !== bestNet) return net > bestNet ? player : best;
    if ((player.cashOut ?? 0) !== (best.cashOut ?? 0)) {
      return (player.cashOut ?? 0) > (best.cashOut ?? 0) ? player : best;
    }
    return player.id < best.id ? player : best;
  });
}

/** Work out who carries how much of one cost. */
function shareOf(expense: LedgerExpenseInput, topWinnerId: string | null): Map<string, number> {
  const shares = new Map<string, number>();

  // The whole dinner bill is on whoever won the most, however many people
  // actually went out and bought the food.
  if (expense.type === 'DINNER') {
    if (topWinnerId) shares.set(topWinnerId, expense.amount);
    return shares;
  }

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
 * Chips come from the banker and go back to the banker, so once everyone has
 * cashed out the buy-ins and the cash-outs have to match. Costs are then taken
 * off the people carrying them.
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
    const buyIn = buyInTotal(player);
    const isPlaying = player.cashOut === null;
    const tableNet = isPlaying ? null : (player.cashOut ?? 0) - buyIn;
    const expenseShare = shareByUser.get(player.userId) ?? 0;
    const net = tableNet === null ? null : tableNet - expenseShare;

    return {
      userId: player.userId,
      displayName: player.displayName,
      buyIn,
      buyInCount: player.buyIns.length,
      cashOut: player.cashOut,
      isPlaying,
      tableNet,
      expenseShare,
      net,
      isBanker: player.isBanker,
      // Finishing ahead is what counts as a win - after the night's costs.
      isWinner: net !== null && net > 0,
      isTopWinner: player.userId === topWinnerId,
    };
  });

  const dinnerExpenses = expenses.filter((expense) => expense.type === 'DINNER');
  const dinner = sum(dinnerExpenses.map((expense) => expense.amount));
  const otherExpenses = sum(
    expenses.filter((expense) => expense.type !== 'DINNER').map((expense) => expense.amount),
  );

  // What the top winner owes each person who went out and bought food.
  // Anything they bought themselves is already theirs, so it nets out.
  const dinnerDebts: DinnerDebt[] = [];
  if (topWinnerId) {
    const owedByUser = new Map<string, number>();
    for (const expense of dinnerExpenses) {
      if (!expense.paidById || expense.paidById === topWinnerId) continue;
      owedByUser.set(expense.paidById, (owedByUser.get(expense.paidById) ?? 0) + expense.amount);
    }
    for (const [toUserId, amount] of owedByUser) {
      if (amount > 0) dinnerDebts.push({ toUserId, amount });
    }
    dinnerDebts.sort((a, b) => b.amount - a.amount || a.toUserId.localeCompare(b.toUserId));
  }

  const totalBuyIn = sum(players.map(buyInTotal));
  const totalCashOut = sum(players.map((player) => player.cashOut ?? 0));
  const playersStillIn = players.filter((player) => player.cashOut === null).length;
  const complete = players.length > 0 && playersStillIn === 0;

  return {
    lines,
    topWinnerId,
    complete,
    playersStillIn,
    dinnerDebts,
    totals: {
      buyIn: totalBuyIn,
      cashOut: totalCashOut,
      dinner,
      otherExpenses,
      expenses: dinner + otherExpenses,
      difference: totalBuyIn - totalCashOut,
    },
    // A night still in progress is not unbalanced, it is unfinished.
    balanced: complete && totalBuyIn - totalCashOut === 0,
  };
}
