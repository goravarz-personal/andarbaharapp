import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { computeGameLedger } from './ledger.service';

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
      shares: {
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.GameInclude;

export type GameWithRelations = Prisma.GameGetPayload<{ include: typeof gameInclude }>;

export async function findGameOrThrow(gameId: string): Promise<GameWithRelations> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game) throw ApiError.notFound('That game no longer exists.');
  return game;
}

export function ledgerOf(game: GameWithRelations) {
  return computeGameLedger(
    game.players.map((player) => ({
      id: player.id,
      userId: player.userId,
      displayName: player.user.displayName,
      buyIn: player.buyIn,
      cashOut: player.cashOut,
      isBanker: player.isBanker,
    })),
    game.expenses.map((expense) => ({
      id: expense.id,
      type: expense.type,
      amount: expense.amount,
      shareUserIds: expense.shares.map((share) => share.userId),
    })),
  );
}

/** Full game payload the app renders, ledger already worked out. */
export function serializeGame(game: GameWithRelations) {
  const ledger = ledgerOf(game);
  const lineByUser = new Map(ledger.lines.map((line) => [line.userId, line]));
  const nameByUser = new Map(game.players.map((p) => [p.userId, p.user.displayName]));
  const topWinner = ledger.lines.find((line) => line.isTopWinner) ?? null;

  return {
    id: game.id,
    playedOn: game.playedOn.toISOString(),
    title: game.title,
    location: game.location,
    notes: game.notes,
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
        isBanker: player.isBanker,
        notes: player.notes,
        tableNet: line?.tableNet ?? player.cashOut - player.buyIn,
        expenseShare: line?.expenseShare ?? 0,
        net: line?.net ?? player.cashOut - player.buyIn,
        isWinner: line?.isWinner ?? false,
        isTopWinner: line?.isTopWinner ?? false,
      };
    }),
    expenses: game.expenses.map((expense) => ({
      id: expense.id,
      type: expense.type,
      label: expense.label,
      amount: expense.amount,
      /** Dinner names the top winner; everything else names who chipped in. */
      carriedBy:
        expense.type === 'DINNER'
          ? topWinner
            ? [{ userId: topWinner.userId, displayName: topWinner.displayName }]
            : []
          : expense.shares.map((share) => ({
              userId: share.userId,
              displayName: share.user.displayName,
            })),
    })),
    totals: ledger.totals,
    balanced: ledger.balanced,
    banker: (() => {
      const seat = game.players.find((player) => player.isBanker);
      return seat ? { userId: seat.userId, displayName: seat.user.displayName } : null;
    })(),
    topWinner: topWinner
      ? {
          userId: topWinner.userId,
          displayName: nameByUser.get(topWinner.userId) ?? topWinner.displayName,
          net: topWinner.net,
          tableNet: topWinner.tableNet,
        }
      : null,
  };
}

/** Lighter payload for the games list. */
export function serializeGameSummary(game: GameWithRelations) {
  const ledger = ledgerOf(game);
  const topWinner = ledger.lines.find((line) => line.isTopWinner) ?? null;

  return {
    id: game.id,
    playedOn: game.playedOn.toISOString(),
    title: game.title,
    location: game.location,
    playerCount: game.players.length,
    totals: ledger.totals,
    balanced: ledger.balanced,
    topWinner: topWinner
      ? { userId: topWinner.userId, displayName: topWinner.displayName }
      : null,
    players: ledger.lines.map((line) => ({
      userId: line.userId,
      displayName: line.displayName,
      avatarColor:
        game.players.find((p) => p.userId === line.userId)?.user.avatarColor ?? null,
      net: line.net,
    })),
  };
}

/**
 * Checks the people named as carrying a cost are actually in the game.
 * Dinner names nobody - it lands on whoever won the most.
 */
export async function assertShareUsersAreSeated(
  gameId: string,
  type: string,
  shareUserIds: string[],
): Promise<string[]> {
  if (type === 'DINNER') return [];

  if (shareUserIds.length === 0) {
    throw ApiError.badRequest('Say who is covering this one.');
  }

  const seated = await prisma.gamePlayer.findMany({
    where: { gameId },
    select: { userId: true },
  });
  const seatedIds = new Set(seated.map((seat) => seat.userId));

  if (seatedIds.size === 0) {
    throw ApiError.badRequest('Add players to the game before recording what it cost.');
  }
  if (shareUserIds.some((userId) => !seatedIds.has(userId))) {
    throw ApiError.badRequest('Everyone chipping in has to be a player in this game.');
  }
  return [...new Set(shareUserIds)];
}

/** At most one banker per game - somebody has to be holding the cash. */
export async function clearOtherBankers(
  tx: Prisma.TransactionClient,
  gameId: string,
  keepUserId: string,
): Promise<void> {
  await tx.gamePlayer.updateMany({
    where: { gameId, userId: { not: keepUserId }, isBanker: true },
    data: { isBanker: false },
  });
}
