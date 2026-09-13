import { describe, expect, it } from 'vitest';
import { splitEvenly, sum } from '../src/lib/money';
import {
  computeGameLedger,
  findTopWinner,
  type LedgerExpenseInput,
  type LedgerPlayerInput,
} from '../src/services/ledger.service';

const player = (id: string, buyIn: number, cashOut: number, isBanker = false): LedgerPlayerInput => ({
  id,
  userId: id,
  displayName: id,
  buyIn,
  cashOut,
  isBanker,
});

const expense = (over: Partial<LedgerExpenseInput> = {}): LedgerExpenseInput => ({
  id: 'e1',
  type: 'DINNER',
  amount: 1000,
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
    expect(sum(ledger.lines.map((line) => line.net))).toBe(-1200);
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
