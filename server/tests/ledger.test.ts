import { describe, expect, it } from 'vitest';
import { splitEvenly, sum } from '../src/lib/money';
import {
  computeGameLedger,
  findWinnerId,
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
  type: 'DINNER',
  amount: 1000,
  paidById: 'a',
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

describe('computeGameLedger', () => {
  it("a player's result is simply what they took home less what they put in", () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 3000, true)],
      [],
    );

    expect(ledger.lines.find((line) => line.userId === 'a')?.net).toBe(-1000);
    expect(ledger.lines.find((line) => line.userId === 'b')?.net).toBe(1000);
  });

  it('balances when the buy-ins cover the cash-outs plus what was spent', () => {
    // 4000 in, 3000 taken home, 1000 spent on dinner.
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 2000, true)],
      [expense({ amount: 1000, paidById: 'b' })],
    );

    expect(ledger.totals).toMatchObject({ buyIn: 4000, cashOut: 3000, expenses: 1000 });
    expect(ledger.totals.difference).toBe(0);
    expect(ledger.balanced).toBe(true);
  });

  it('flags a night where the money does not add up, and by how much', () => {
    // 4000 in, 3000 out, but only 600 of spending accounted for.
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 2000, true)],
      [expense({ amount: 600, paidById: 'b' })],
    );

    expect(ledger.balanced).toBe(false);
    expect(ledger.totals.difference).toBe(400);
  });

  it('is balanced with no expenses when the pot is handed back out in full', () => {
    const ledger = computeGameLedger([player('a', 2000, 1500), player('b', 2000, 2500, true)], []);
    expect(ledger.balanced).toBe(true);
  });

  it('leaves the table collectively down by whatever the night cost', () => {
    const ledger = computeGameLedger(
      [player('a', 3000, 2000), player('b', 3000, 2500, true), player('c', 3000, 3000)],
      [expense({ amount: 1500, paidById: 'b' })],
    );
    // The money that left the table is exactly the money that was spent.
    expect(sum(ledger.lines.map((line) => line.net))).toBe(-1500);
    expect(ledger.balanced).toBe(true);
  });

  it('totals dinner separately from everything else', () => {
    const ledger = computeGameLedger(
      [player('a', 1000, 0, true)],
      [
        expense({ id: 'e1', amount: 800, type: 'DINNER' }),
        expense({ id: 'e2', amount: 200, type: 'CARDS' }),
      ],
    );
    expect(ledger.totals).toMatchObject({ dinner: 800, otherExpenses: 200, expenses: 1000 });
    expect(ledger.balanced).toBe(true);
  });
});

describe('findWinnerId', () => {
  it('finds whoever is flagged', () => {
    expect(
      findWinnerId([
        { userId: 'a', isWinner: false },
        { userId: 'b', isWinner: true },
      ]),
    ).toBe('b');
  });

  it('returns nothing when nobody is flagged yet', () => {
    expect(findWinnerId([{ userId: 'a', isWinner: false }])).toBeNull();
  });
});
