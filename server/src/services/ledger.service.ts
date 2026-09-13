import { splitEvenly, sum } from '../lib/money';

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
  label: string;
  category: string;
  amount: number;
  paidById: string;
  splitMode: string;
  shares: Array<{ userId: string; amount: number }>;
}

export interface PlayerLedgerLine {
  userId: string;
  displayName: string;
  buyIn: number;
  cashOut: number;
  /** What the cards did: cashOut - buyIn. */
  tableNet: number;
  /** Expense money this player fronted for the group. */
  expensePaid: number;
  /** This player's slice of the dinner/other expenses. */
  expenseShare: number;
  /** The number that actually matters: tableNet - expenseShare + expensePaid. */
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
    /** cashOut - buyIn. Non-zero means the chip counts don't add up. */
    tableImbalance: number;
  };
  /** True when the chips on the table reconcile with the cash. */
  balanced: boolean;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/**
 * Work out each player's slice of one expense.
 *
 *  EQUAL  - split across everyone seated in the game
 *  CUSTOM - use the explicit shares as recorded
 *  PAYER  - the payer treats the table and carries the whole cost
 *
 * Shares always add back up to the expense amount, which is what keeps the
 * game's nets summing to zero.
 */
export function shareExpense(
  expense: LedgerExpenseInput,
  players: LedgerPlayerInput[],
): Map<string, number> {
  const shares = new Map<string, number>();

  if (expense.splitMode === 'CUSTOM' && expense.shares.length > 0) {
    for (const share of expense.shares) {
      shares.set(share.userId, (shares.get(share.userId) ?? 0) + share.amount);
    }
    return shares;
  }

  if (expense.splitMode === 'PAYER' || players.length === 0) {
    shares.set(expense.paidById, expense.amount);
    return shares;
  }

  // EQUAL - stable ordering so the odd paisa always lands on the same person
  // for the same data, instead of jittering between reads.
  const ordered = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const slices = splitEvenly(expense.amount, ordered.length);
  ordered.forEach((player, index) => {
    const slice = slices[index] ?? 0;
    shares.set(player.userId, (shares.get(player.userId) ?? 0) + slice);
  });
  return shares;
}

/** Build the full per-player ledger for one game. */
export function computeGameLedger(
  players: LedgerPlayerInput[],
  expenses: LedgerExpenseInput[],
): GameLedger {
  const paidByUser = new Map<string, number>();
  const shareByUser = new Map<string, number>();

  for (const expense of expenses) {
    paidByUser.set(expense.paidById, (paidByUser.get(expense.paidById) ?? 0) + expense.amount);
    for (const [userId, amount] of shareExpense(expense, players)) {
      shareByUser.set(userId, (shareByUser.get(userId) ?? 0) + amount);
    }
  }

  const lines: PlayerLedgerLine[] = players.map((player) => {
    const tableNet = player.cashOut - player.buyIn;
    const expensePaid = paidByUser.get(player.userId) ?? 0;
    const expenseShare = shareByUser.get(player.userId) ?? 0;
    return {
      userId: player.userId,
      displayName: player.displayName,
      buyIn: player.buyIn,
      cashOut: player.cashOut,
      tableNet,
      expensePaid,
      expenseShare,
      net: tableNet - expenseShare + expensePaid,
      isWinner: player.isWinner,
    };
  });

  const dinner = sum(expenses.filter((e) => e.category === 'DINNER').map((e) => e.amount));
  const otherExpenses = sum(expenses.filter((e) => e.category !== 'DINNER').map((e) => e.amount));
  const totalBuyIn = sum(players.map((p) => p.buyIn));
  const totalCashOut = sum(players.map((p) => p.cashOut));

  return {
    lines,
    totals: {
      buyIn: totalBuyIn,
      cashOut: totalCashOut,
      dinner,
      otherExpenses,
      expenses: dinner + otherExpenses,
      tableImbalance: totalCashOut - totalBuyIn,
    },
    balanced: totalCashOut - totalBuyIn === 0,
  };
}

/**
 * Turn a set of net positions into the fewest payments that clear them:
 * repeatedly pay the biggest debtor's money to the biggest creditor. For n
 * people this settles in at most n-1 transfers instead of everyone paying
 * everyone.
 */
export function minimiseTransfers(balances: Array<{ userId: string; net: number }>): Transfer[] {
  const byOwed = (a: { remaining: number; userId: string }, b: { remaining: number; userId: string }) =>
    b.remaining - a.remaining || a.userId.localeCompare(b.userId);

  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ userId: b.userId, remaining: -b.net }))
    .sort(byOwed);
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ userId: b.userId, remaining: b.net }))
    .sort(byOwed);

  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    if (!debtor || !creditor) break;

    const amount = Math.min(debtor.remaining, creditor.remaining);
    if (amount <= 0) break;

    transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
    debtor.remaining -= amount;
    creditor.remaining -= amount;

    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }

  return transfers;
}

/**
 * Net every outstanding IOU down to one line per pair of people, so two players
 * who owe each other see a single number rather than two opposing ones.
 */
export function netOutstanding(
  settlements: Array<{ fromUserId: string; toUserId: string; amount: number }>,
): Transfer[] {
  const pairs = new Map<string, number>();

  for (const settlement of settlements) {
    const [a, b] = [settlement.fromUserId, settlement.toUserId].sort() as [string, string];
    const key = `${a}|${b}`;
    // Positive means "a owes b".
    const signed = settlement.fromUserId === a ? settlement.amount : -settlement.amount;
    pairs.set(key, (pairs.get(key) ?? 0) + signed);
  }

  const result: Transfer[] = [];
  for (const [key, value] of pairs) {
    if (value === 0) continue;
    const [a, b] = key.split('|') as [string, string];
    result.push(
      value > 0
        ? { fromUserId: a, toUserId: b, amount: value }
        : { fromUserId: b, toUserId: a, amount: -value },
    );
  }
  return result.sort((x, y) => y.amount - x.amount);
}
