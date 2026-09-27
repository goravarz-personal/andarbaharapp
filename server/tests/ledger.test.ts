import { describe, expect, it } from 'vitest';
import { splitEvenly, sum } from '../src/lib/money';
import {
  computeGameLedger,
  findTopWinner,
  type LedgerExpenseInput,
  type LedgerPlayerInput,
} from '../src/services/ledger.service';

/** A seat with one buy-in and a cash-out. */
const player = (
  id: string,
  buyIn: number,
  cashOut: number | null,
  isBanker = false,
): LedgerPlayerInput => ({
  id,
  userId: id,
  displayName: id,
  buyIns: [{ amount: buyIn }],
  cashOut,
  isBanker,
});

/** A seat that went back to the banker for more chips. */
const rebuyer = (id: string, amounts: number[], cashOut: number | null): LedgerPlayerInput => ({
  id,
  userId: id,
  displayName: id,
  buyIns: amounts.map((amount) => ({ amount })),
  cashOut,
  isBanker: false,
});

const expense = (over: Partial<LedgerExpenseInput> = {}): LedgerExpenseInput => ({
  id: 'e1',
  type: 'DINNER',
  amount: 1000,
  paidById: null,
  shareUserIds: [],
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
});

describe('findTopWinner', () => {
  it('picks whoever took the most off the table', () => {
    const top = findTopWinner([player('a', 2000, 1000), player('b', 2000, 3000), player('c', 2000, 2000)]);
    expect(top?.userId).toBe('b');
  });

  it('judges on the table result, not on what is left after dinner', () => {
    // b wins the most but would end up behind a once a big dinner comes off.
    // Dinner lands on b regardless, or the question would chase its own tail.
    const ledger = computeGameLedger(
      [player('a', 1000, 1400), player('b', 1000, 1600), player('c', 1000, 0)],
      [expense({ amount: 900 })],
    );
    const b = ledger.lines.find((line) => line.userId === 'b');
    expect(b?.isTopWinner).toBe(true);
    expect(b?.net).toBe(-300);
  });

  it('breaks a tie the same way every time', () => {
    const first = findTopWinner([player('a', 1000, 2000), player('b', 1000, 2000)]);
    const second = findTopWinner([player('b', 1000, 2000), player('a', 1000, 2000)]);
    expect(first?.userId).toBe(second?.userId);
  });

  it('has nobody to name at an empty table', () => {
    expect(findTopWinner([])).toBeNull();
  });
});

describe('computeGameLedger', () => {
  it('balances when the chips that went out came back in', () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000, true), player('b', 2000, 3000)],
      [],
    );
    expect(ledger.totals).toMatchObject({ buyIn: 4000, cashOut: 4000, difference: 0 });
    expect(ledger.balanced).toBe(true);
  });

  it('flags chips that do not add up, and by how much', () => {
    const ledger = computeGameLedger([player('a', 2000, 1000), player('b', 2000, 2500)], []);
    expect(ledger.balanced).toBe(false);
    expect(ledger.totals.difference).toBe(500);
  });

  it('puts the whole dinner on the top winner and nobody else', () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 3000), player('c', 2000, 2000)],
      [expense({ amount: 600 })],
    );

    const [a, b, c] = ['a', 'b', 'c'].map((id) => ledger.lines.find((line) => line.userId === id));
    expect(b).toMatchObject({ tableNet: 1000, expenseShare: 600, net: 400, isTopWinner: true });
    expect(a?.expenseShare).toBe(0);
    expect(c?.expenseShare).toBe(0);
  });

  it('splits a non-dinner cost evenly between whoever chipped in', () => {
    const ledger = computeGameLedger(
      [player('a', 1000, 1000), player('b', 1000, 1000), player('c', 1000, 1000)],
      [expense({ type: 'CARDS', amount: 300, shareUserIds: ['a', 'b'] })],
    );
    expect(ledger.lines.find((line) => line.userId === 'a')?.expenseShare).toBe(150);
    expect(ledger.lines.find((line) => line.userId === 'b')?.expenseShare).toBe(150);
    expect(ledger.lines.find((line) => line.userId === 'c')?.expenseShare).toBe(0);
  });

  it('lets one person carry a non-dinner cost alone', () => {
    const ledger = computeGameLedger(
      [player('a', 1000, 1000), player('b', 1000, 1000)],
      [expense({ type: 'TRAVEL', amount: 250, shareUserIds: ['b'] })],
    );
    expect(ledger.lines.find((line) => line.userId === 'b')?.expenseShare).toBe(250);
  });

  it('counts everyone who finishes ahead as a winner, not just the top one', () => {
    // b takes the most and buys dinner; a still finishes ahead.
    const ledger = computeGameLedger(
      [player('a', 3000, 3300), player('b', 3000, 5400), player('c', 3000, 2100), player('d', 3000, 1200)],
      [expense({ amount: 1800 })],
    );

    const winners = ledger.lines.filter((line) => line.isWinner).map((line) => line.userId);
    expect(winners.sort()).toEqual(['a', 'b']);
    expect(ledger.lines.filter((line) => line.isTopWinner)).toHaveLength(1);
    expect(ledger.topWinnerId).toBe('b');
  });

  it('leaves the table collectively down by whatever the night cost', () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 3000), player('c', 2000, 2000)],
      [
        expense({ id: 'e1', amount: 900 }),
        expense({ id: 'e2', type: 'SNACKS', amount: 300, shareUserIds: ['a', 'c'] }),
      ],
    );
    // Everyone has cashed out, so every net is a number.
    expect(sum(ledger.lines.map((line) => line.net ?? Number.NaN))).toBe(-1200);
    expect(ledger.balanced).toBe(true);
  });

  it('totals dinner separately from everything else', () => {
    const ledger = computeGameLedger(
      [player('a', 1000, 1000)],
      [
        expense({ id: 'e1', amount: 800 }),
        expense({ id: 'e2', type: 'CARDS', amount: 200, shareUserIds: ['a'] }),
      ],
    );
    expect(ledger.totals).toMatchObject({ dinner: 800, otherExpenses: 200, expenses: 1000 });
  });

  it('remembers who held the bank', () => {
    const ledger = computeGameLedger([player('a', 1000, 1000, true), player('b', 1000, 1000)], []);
    expect(ledger.lines.find((line) => line.userId === 'a')?.isBanker).toBe(true);
    expect(ledger.lines.find((line) => line.userId === 'b')?.isBanker).toBe(false);
  });
});

describe('buying in more than once', () => {
  it('adds every trip to the banker together', () => {
    const ledger = computeGameLedger(
      [rebuyer('a', [1000, 1000, 500], 900), player('b', 2500, 4100)],
      [],
    );
    const a = ledger.lines.find((line) => line.userId === 'a');
    expect(a).toMatchObject({ buyIn: 2500, buyInCount: 3, tableNet: -1600 });
    expect(ledger.balanced).toBe(true);
  });
});

describe('a night still being played', () => {
  it('has no result for someone who has not cashed out', () => {
    const ledger = computeGameLedger([player('a', 1000, 500), player('b', 1000, null)], []);
    const b = ledger.lines.find((line) => line.userId === 'b');
    expect(b).toMatchObject({ isPlaying: true, cashOut: null, tableNet: null, net: null });
    expect(b?.isWinner).toBe(false);
  });

  it('is unfinished rather than unbalanced', () => {
    const ledger = computeGameLedger([player('a', 1000, 500), player('b', 1000, null)], []);
    expect(ledger.complete).toBe(false);
    expect(ledger.playersStillIn).toBe(1);
    // Not "balanced" - there is nothing to balance yet.
    expect(ledger.balanced).toBe(false);
  });

  it('settles once the last player cashes out', () => {
    const ledger = computeGameLedger([player('a', 1000, 500), player('b', 1000, 1500)], []);
    expect(ledger.complete).toBe(true);
    expect(ledger.balanced).toBe(true);
  });

  it('judges the top winner only on people who have finished', () => {
    // b is still in and might yet win, but cannot be named until they cash out.
    const ledger = computeGameLedger([player('a', 1000, 1600), player('b', 1000, null)], []);
    expect(ledger.topWinnerId).toBe('a');
  });

  it('crowns nobody while the only person out is down on the night', () => {
    // a busted and left; b and c are still holding chips. Somebody who lost
    // has won nothing, so there is no top winner yet.
    const ledger = computeGameLedger(
      [player('a', 3000, 0), player('b', 2000, null), player('c', 1000, null)],
      [],
    );
    expect(ledger.topWinnerId).toBe(null);
    expect(ledger.lines.every((line) => !line.isTopWinner)).toBe(true);
  });

  it('leaves dinner unowned until somebody is actually ahead', () => {
    const down = computeGameLedger(
      [player('a', 3000, 0), player('b', 2000, null)],
      [expense({ amount: 1200, paidById: 'a' })],
    );
    // Nobody carries it, and the person who bought it is not owed by anyone yet.
    expect(down.lines.every((line) => line.expenseShare === 0)).toBe(true);
    expect(down.dinnerDebts).toEqual([]);

    // b cashes out ahead and the bill finds its owner.
    const settled = computeGameLedger(
      [player('a', 3000, 0), player('b', 2000, 5000)],
      [expense({ amount: 1200, paidById: 'a' })],
    );
    expect(settled.topWinnerId).toBe('b');
    expect(settled.lines.find((line) => line.userId === 'b')?.expenseShare).toBe(1200);
    expect(settled.dinnerDebts).toEqual([{ toUserId: 'a', amount: 1200 }]);
  });
});

describe('dinner bought by several people', () => {
  it('adds the food into one bill and puts all of it on the top winner', () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 3400), player('c', 2000, 1600)],
      [
        expense({ id: 'd1', amount: 400, paidById: 'a' }),
        expense({ id: 'd2', amount: 1200, paidById: 'c' }),
      ],
    );

    expect(ledger.totals.dinner).toBe(1600);
    const b = ledger.lines.find((line) => line.userId === 'b');
    expect(b).toMatchObject({ isTopWinner: true, expenseShare: 1600, net: -200 });
    // The people who bought the food carry none of it.
    expect(ledger.lines.find((line) => line.userId === 'a')?.expenseShare).toBe(0);
    expect(ledger.lines.find((line) => line.userId === 'c')?.expenseShare).toBe(0);
  });

  it('says what the top winner owes each person who bought food', () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 3400), player('c', 2000, 1600)],
      [
        expense({ id: 'd1', amount: 400, paidById: 'a' }),
        expense({ id: 'd2', amount: 1200, paidById: 'c' }),
      ],
    );
    expect(ledger.dinnerDebts).toEqual([
      { toUserId: 'c', amount: 1200 },
      { toUserId: 'a', amount: 400 },
    ]);
  });

  it('owes nothing for food the top winner bought themselves', () => {
    const ledger = computeGameLedger(
      [player('a', 2000, 1000), player('b', 2000, 3000)],
      [
        expense({ id: 'd1', amount: 600, paidById: 'b' }),
        expense({ id: 'd2', amount: 400, paidById: 'a' }),
      ],
    );
    // b won the most and already paid 600 of the 1000 bill.
    expect(ledger.dinnerDebts).toEqual([{ toUserId: 'a', amount: 400 }]);
    expect(ledger.lines.find((line) => line.userId === 'b')?.expenseShare).toBe(1000);
  });
});
