import { describe, expect, it } from 'vitest';
import { splitEvenly, sum } from '../src/lib/money';
import {
  computeGameLedger,
  minimiseTransfers,
  netOutstanding,
  shareExpense,
  type LedgerExpenseInput,
  type LedgerPlayerInput,
} from '../src/services/ledger.service';

const player = (id: string, buyIn: number, cashOut: number, isWinner = false): LedgerPlayerInput => ({
  id,
  userId: id,
  displayName: id,
  buyIn,
  cashOut,
  isWinner,
});

const expense = (over: Partial<LedgerExpenseInput> = {}): LedgerExpenseInput => ({
  id: 'e1',
  label: 'Dinner',
  category: 'DINNER',
  amount: 1000,
  paidById: 'a',
  splitMode: 'EQUAL',
  shares: [],
  ...over,
});

describe('splitEvenly', () => {
  it('splits cleanly when it divides', () => {
    expect(splitEvenly(1000, 4)).toEqual([250, 250, 250, 250]);
  });

  it('never loses a paisa to rounding', () => {
    const shares = splitEvenly(1001, 3);
    expect(sum(shares)).toBe(1001);
    expect(shares).toEqual([334, 334, 333]);
  });

  it('handles a single person and an empty table', () => {
    expect(splitEvenly(777, 1)).toEqual([777]);
    expect(splitEvenly(777, 0)).toEqual([]);
  });
});

describe('shareExpense', () => {
  const players = [player('a', 0, 0), player('b', 0, 0), player('c', 0, 0)];

  it('EQUAL spreads across everyone seated and adds back up', () => {
    const shares = shareExpense(expense({ amount: 1000 }), players);
    expect(sum([...shares.values()])).toBe(1000);
    expect([...shares.values()].sort()).toEqual([333, 333, 334]);
  });

  it('PAYER puts the whole cost on the person who treated', () => {
    const shares = shareExpense(expense({ splitMode: 'PAYER', paidById: 'b' }), players);
    expect(shares.get('b')).toBe(1000);
    expect(shares.size).toBe(1);
  });

  it('CUSTOM uses the recorded shares', () => {
    const shares = shareExpense(
      expense({
        splitMode: 'CUSTOM',
        shares: [
          { userId: 'a', amount: 700 },
          { userId: 'b', amount: 300 },
        ],
      }),
      players,
    );
    expect(shares.get('a')).toBe(700);
    expect(shares.get('b')).toBe(300);
    expect(shares.get('c')).toBeUndefined();
  });

  it('falls back to the payer when nobody is seated yet', () => {
    const shares = shareExpense(expense({ paidById: 'a' }), []);
    expect(shares.get('a')).toBe(1000);
  });
});

describe('computeGameLedger', () => {
  it('nets the table and the expenses together', () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 3000, true)],
      [expense({ amount: 1000, paidById: 'a', splitMode: 'EQUAL' })],
    );

    const a = ledger.lines.find((line) => line.userId === 'a');
    const b = ledger.lines.find((line) => line.userId === 'b');

    // a lost 1000 at the table but fronted 1000 of dinner and owes half of it.
    expect(a).toMatchObject({ tableNet: -1000, expensePaid: 1000, expenseShare: 500, net: -500 });
    expect(b).toMatchObject({ tableNet: 1000, expensePaid: 0, expenseShare: 500, net: 500 });
    expect(ledger.balanced).toBe(true);
  });

  it('always sums the nets to zero when the chips balance', () => {
    const ledger = computeGameLedger(
      [player('a', 3000, 1500), player('b', 3000, 4700), player('c', 3000, 2800)],
      [
        expense({ id: 'e1', amount: 1001, paidById: 'c', splitMode: 'EQUAL' }),
        expense({ id: 'e2', amount: 450, category: 'OTHER', paidById: 'a', splitMode: 'PAYER' }),
      ],
    );
    expect(sum(ledger.lines.map((line) => line.net))).toBe(0);
  });

  it('flags a game whose cash-outs do not match the buy-ins', () => {
    const ledger = computeGameLedger([player('a', 2000, 1000), player('b', 2000, 2500)], []);
    expect(ledger.balanced).toBe(false);
    expect(ledger.totals.tableImbalance).toBe(-500);
  });

  it('totals dinner separately from other expenses', () => {
    const ledger = computeGameLedger(
      [player('a', 1000, 1000)],
      [
        expense({ id: 'e1', amount: 800, category: 'DINNER' }),
        expense({ id: 'e2', amount: 200, category: 'OTHER' }),
      ],
    );
    expect(ledger.totals).toMatchObject({ dinner: 800, otherExpenses: 200, expenses: 1000 });
  });
});

describe('minimiseTransfers', () => {
  it('clears the board in at most n-1 payments', () => {
    const transfers = minimiseTransfers([
      { userId: 'a', net: -500 },
      { userId: 'b', net: -300 },
      { userId: 'c', net: 800 },
    ]);
    expect(transfers).toHaveLength(2);
    expect(sum(transfers.map((t) => t.amount))).toBe(800);
    expect(transfers.every((t) => t.toUserId === 'c')).toBe(true);
  });

  it('leaves nobody paying themselves and settles every balance', () => {
    const balances = [
      { userId: 'a', net: -1200 },
      { userId: 'b', net: 700 },
      { userId: 'c', net: -400 },
      { userId: 'd', net: 900 },
    ];
    const transfers = minimiseTransfers(balances);

    const settled = new Map<string, number>();
    for (const transfer of transfers) {
      expect(transfer.fromUserId).not.toBe(transfer.toUserId);
      settled.set(transfer.fromUserId, (settled.get(transfer.fromUserId) ?? 0) - transfer.amount);
      settled.set(transfer.toUserId, (settled.get(transfer.toUserId) ?? 0) + transfer.amount);
    }
    for (const balance of balances) {
      expect(settled.get(balance.userId) ?? 0).toBe(balance.net);
    }
    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
  });

  it('returns nothing when everyone is square', () => {
    expect(minimiseTransfers([{ userId: 'a', net: 0 }, { userId: 'b', net: 0 }])).toEqual([]);
  });
});

describe('netOutstanding', () => {
  it('cancels IOUs that point in opposite directions', () => {
    const netted = netOutstanding([
      { fromUserId: 'a', toUserId: 'b', amount: 500 },
      { fromUserId: 'b', toUserId: 'a', amount: 200 },
    ]);
    expect(netted).toEqual([{ fromUserId: 'a', toUserId: 'b', amount: 300 }]);
  });

  it('drops a pair that has cancelled out entirely', () => {
    const netted = netOutstanding([
      { fromUserId: 'a', toUserId: 'b', amount: 500 },
      { fromUserId: 'b', toUserId: 'a', amount: 500 },
    ]);
    expect(netted).toEqual([]);
  });

  it('keeps separate pairs apart', () => {
    const netted = netOutstanding([
      { fromUserId: 'a', toUserId: 'b', amount: 500 },
      { fromUserId: 'a', toUserId: 'c', amount: 300 },
      { fromUserId: 'a', toUserId: 'b', amount: 100 },
    ]);
    expect(netted).toEqual([
      { fromUserId: 'a', toUserId: 'b', amount: 600 },
      { fromUserId: 'a', toUserId: 'c', amount: 300 },
    ]);
  });
});
