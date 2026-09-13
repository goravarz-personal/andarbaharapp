import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { sum } from '../lib/money';
import {
  computeGameLedger,
  minimiseTransfers,
  type LedgerExpenseInput,
  type LedgerPlayerInput,
} from './ledger.service';

export const gameInclude = {
  createdBy: { select: { id: true, username: true, displayName: true } },
  players: {
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarColor: true } },
    },
    orderBy: { id: 'asc' },
  },
  expenses: {
    include: {
      paidBy: { select: { id: true, username: true, displayName: true } },
      shares: {
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  settlements: {
    include: {
      fromUser: { select: { id: true, username: true, displayName: true, avatarColor: true } },
      toUser: { select: { id: true, username: true, displayName: true, avatarColor: true } },
    },
    orderBy: { amount: 'desc' },
  },
} satisfies Prisma.GameInclude;

export type GameWithRelations = Prisma.GameGetPayload<{ include: typeof gameInclude }>;

export async function findGameOrThrow(gameId: string): Promise<GameWithRelations> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game) throw ApiError.notFound('That game no longer exists.');
  return game;
}

function toLedgerPlayers(game: GameWithRelations): LedgerPlayerInput[] {
  return game.players.map((player) => ({
    id: player.id,
    userId: player.userId,
    displayName: player.user.displayName,
    buyIn: player.buyIn,
    cashOut: player.cashOut,
    isWinner: player.isWinner,
  }));
}

function toLedgerExpenses(game: GameWithRelations): LedgerExpenseInput[] {
  return game.expenses.map((expense) => ({
    id: expense.id,
    label: expense.label,
    category: expense.category,
    amount: expense.amount,
    paidById: expense.paidById,
    splitMode: expense.splitMode,
    shares: expense.shares.map((share) => ({ userId: share.userId, amount: share.amount })),
  }));
}

/** Full game payload the app renders, ledger already worked out. */
export function serializeGame(game: GameWithRelations) {
  const ledger = computeGameLedger(toLedgerPlayers(game), toLedgerExpenses(game));
  const lineByUser = new Map(ledger.lines.map((line) => [line.userId, line]));

  return {
    id: game.id,
    playedOn: game.playedOn.toISOString(),
    title: game.title,
    location: game.location,
    notes: game.notes,
    status: game.status,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    createdBy: game.createdBy,
    playerCount: game.players.length,
    players: game.players.map((player) => {
      const line = lineByUser.get(player.userId);
      return {
        id: player.id,
        userId: player.userId,
        username: player.user.username,
        displayName: player.user.displayName,
        avatarColor: player.user.avatarColor,
        buyIn: player.buyIn,
        cashOut: player.cashOut,
        isWinner: player.isWinner,
        notes: player.notes,
        tableNet: line?.tableNet ?? player.cashOut - player.buyIn,
        expensePaid: line?.expensePaid ?? 0,
        expenseShare: line?.expenseShare ?? 0,
        net: line?.net ?? player.cashOut - player.buyIn,
      };
    }),
    expenses: game.expenses.map((expense) => ({
      id: expense.id,
      label: expense.label,
      category: expense.category,
      amount: expense.amount,
      splitMode: expense.splitMode,
      paidBy: expense.paidBy,
      shares: expense.shares.map((share) => ({
        userId: share.userId,
        displayName: share.user.displayName,
        amount: share.amount,
      })),
    })),
    totals: ledger.totals,
    balanced: ledger.balanced,
    winners: game.players
      .filter((player) => player.isWinner)
      .map((player) => ({
        userId: player.userId,
        displayName: player.user.displayName,
        net: lineByUser.get(player.userId)?.net ?? 0,
      })),
    settlements: game.settlements.map(serializeSettlement),
  };
}

/** Lighter payload for the games list. */
export function serializeGameSummary(game: GameWithRelations) {
  const ledger = computeGameLedger(toLedgerPlayers(game), toLedgerExpenses(game));
  return {
    id: game.id,
    playedOn: game.playedOn.toISOString(),
    title: game.title,
    location: game.location,
    status: game.status,
    playerCount: game.players.length,
    totals: ledger.totals,
    balanced: ledger.balanced,
    pendingSettlements: game.settlements.filter((s) => s.status === 'PENDING').length,
    winners: game.players
      .filter((player) => player.isWinner)
      .map((player) => ({ userId: player.userId, displayName: player.user.displayName })),
    players: game.players.map((player) => ({
      userId: player.userId,
      displayName: player.user.displayName,
      avatarColor: player.user.avatarColor,
      net: ledger.lines.find((line) => line.userId === player.userId)?.net ?? 0,
    })),
  };
}

type SettlementWithUsers = Prisma.SettlementGetPayload<{
  include: {
    fromUser: { select: { id: true; username: true; displayName: true; avatarColor: true } };
    toUser: { select: { id: true; username: true; displayName: true; avatarColor: true } };
  };
}>;

export function serializeSettlement(settlement: SettlementWithUsers) {
  return {
    id: settlement.id,
    gameId: settlement.gameId,
    amount: settlement.amount,
    status: settlement.status,
    kind: settlement.kind,
    note: settlement.note,
    paidAt: settlement.paidAt ? settlement.paidAt.toISOString() : null,
    createdAt: settlement.createdAt.toISOString(),
    from: settlement.fromUser,
    to: settlement.toUser,
  };
}

/**
 * Check an expense before it is written: the payer has to be at the table, and
 * a custom split has to name real players and add up to the full amount.
 */
export function assertExpenseIsConsistent(
  input: { amount: number; paidById: string; splitMode: string; shares?: Array<{ userId: string; amount: number }> },
  seatedUserIds: string[],
): void {
  if (!seatedUserIds.includes(input.paidById)) {
    throw ApiError.badRequest('Whoever paid needs to be one of the players in this game.');
  }

  if (input.splitMode !== 'CUSTOM') return;

  const shares = input.shares ?? [];
  if (shares.length === 0) {
    throw ApiError.badRequest('A custom split needs at least one share.');
  }
  const stranger = shares.find((share) => !seatedUserIds.includes(share.userId));
  if (stranger) {
    throw ApiError.badRequest('A custom split can only include players in this game.');
  }
  const total = sum(shares.map((share) => share.amount));
  if (total !== input.amount) {
    throw ApiError.badRequest(
      `The custom shares add up to ${total} but the expense is ${input.amount}. They have to match.`,
    );
  }
}

/**
 * Work out who pays whom for this game and store it. Replaces any previously
 * generated (AUTO) settlements; hand-recorded ones are left alone.
 */
export async function settleGame(gameId: string, force = false) {
  const game = await findGameOrThrow(gameId);

  if (game.players.length === 0) {
    throw ApiError.badRequest('Add players to the game before settling it.');
  }

  const alreadyPaid = game.settlements.filter((s) => s.kind === 'AUTO' && s.status === 'PAID');
  if (alreadyPaid.length > 0 && !force) {
    throw ApiError.conflict(
      'Some payments for this game are already marked paid. Re-settling will wipe them - send force=true to go ahead.',
      { paidCount: alreadyPaid.length },
    );
  }

  const ledger = computeGameLedger(toLedgerPlayers(game), toLedgerExpenses(game));
  const transfers = minimiseTransfers(
    ledger.lines.map((line) => ({ userId: line.userId, net: line.net })),
  );

  await prisma.$transaction([
    prisma.settlement.deleteMany({ where: { gameId, kind: 'AUTO' } }),
    ...transfers.map((transfer) =>
      prisma.settlement.create({
        data: {
          gameId,
          fromUserId: transfer.fromUserId,
          toUserId: transfer.toUserId,
          amount: transfer.amount,
          kind: 'AUTO',
          status: 'PENDING',
        },
      }),
    ),
    prisma.game.update({ where: { id: gameId }, data: { status: 'SETTLED' } }),
  ]);

  return findGameOrThrow(gameId);
}
