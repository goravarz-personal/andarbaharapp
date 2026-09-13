import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sum } from '../lib/money';
import { computeGameLedger, netOutstanding, type PlayerLedgerLine } from './ledger.service';
import { gameInclude, serializeGameSummary, type GameWithRelations } from './game.service';

interface GameLedgerEntry {
  game: GameWithRelations;
  lines: PlayerLedgerLine[];
}

/**
 * Ledgers are derived, not stored, so history and stats are always consistent
 * with the games as they stand right now. A home game's worth of data is small
 * enough to fold in memory; if this ever grows, cache per game id.
 */
async function loadLedgers(where: Prisma.GameWhereInput = {}): Promise<GameLedgerEntry[]> {
  const games = await prisma.game.findMany({
    where,
    include: gameInclude,
    orderBy: { playedOn: 'desc' },
  });

  return games.map((game) => ({
    game,
    lines: computeGameLedger(
      game.players.map((player) => ({
        id: player.id,
        userId: player.userId,
        displayName: player.user.displayName,
        buyIn: player.buyIn,
        cashOut: player.cashOut,
        isWinner: player.isWinner,
      })),
      game.expenses.map((expense) => ({
        id: expense.id,
        label: expense.label,
        category: expense.category,
        amount: expense.amount,
        paidById: expense.paidById,
        splitMode: expense.splitMode,
        shares: expense.shares.map((share) => ({ userId: share.userId, amount: share.amount })),
      })),
    ).lines,
  }));
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  winRate: number;
  totalBuyIn: number;
  totalCashOut: number;
  netProfit: number;
  bestGame: number;
  worstGame: number;
  averageNet: number;
  expensesPaid: number;
  expenseShare: number;
  lastPlayedOn: string | null;
}

export interface PlayerHistoryRow {
  gameId: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  status: string;
  playerCount: number;
  buyIn: number;
  cashOut: number;
  tableNet: number;
  expensePaid: number;
  expenseShare: number;
  net: number;
  isWinner: boolean;
}

export async function getPlayerHistory(userId: string): Promise<PlayerHistoryRow[]> {
  const ledgers = await loadLedgers({ players: { some: { userId } } });

  const rows: PlayerHistoryRow[] = [];
  for (const { game, lines } of ledgers) {
    const line = lines.find((candidate) => candidate.userId === userId);
    if (!line) continue;
    rows.push({
      gameId: game.id,
      playedOn: game.playedOn.toISOString(),
      title: game.title,
      location: game.location,
      status: game.status,
      playerCount: game.players.length,
      buyIn: line.buyIn,
      cashOut: line.cashOut,
      tableNet: line.tableNet,
      expensePaid: line.expensePaid,
      expenseShare: line.expenseShare,
      net: line.net,
      isWinner: line.isWinner,
    });
  }
  return rows;
}

export function summarise(rows: PlayerHistoryRow[]): PlayerStats {
  const gamesPlayed = rows.length;
  const wins = rows.filter((row) => row.isWinner).length;
  const nets = rows.map((row) => row.net);

  return {
    gamesPlayed,
    wins,
    winRate: gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 1000) / 10,
    totalBuyIn: sum(rows.map((row) => row.buyIn)),
    totalCashOut: sum(rows.map((row) => row.cashOut)),
    netProfit: sum(nets),
    bestGame: nets.length === 0 ? 0 : Math.max(...nets),
    worstGame: nets.length === 0 ? 0 : Math.min(...nets),
    averageNet: gamesPlayed === 0 ? 0 : Math.round(sum(nets) / gamesPlayed),
    expensesPaid: sum(rows.map((row) => row.expensePaid)),
    expenseShare: sum(rows.map((row) => row.expenseShare)),
    lastPlayedOn: rows[0]?.playedOn ?? null,
  };
}

export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  return summarise(await getPlayerHistory(userId));
}

/** Everything one player owes or is owed, netted per counterparty. */
export async function getPlayerBalances(userId: string) {
  const pending = await prisma.settlement.findMany({
    where: { status: 'PENDING', OR: [{ fromUserId: userId }, { toUserId: userId }] },
  });

  const netted = netOutstanding(pending).filter(
    (transfer) => transfer.fromUserId === userId || transfer.toUserId === userId,
  );

  const counterpartyIds = netted.map((transfer) =>
    transfer.fromUserId === userId ? transfer.toUserId : transfer.fromUserId,
  );
  const people = await prisma.user.findMany({
    where: { id: { in: counterpartyIds } },
    select: { id: true, username: true, displayName: true, avatarColor: true },
  });
  const peopleById = new Map(people.map((person) => [person.id, person]));

  const owes = netted
    .filter((transfer) => transfer.fromUserId === userId)
    .map((transfer) => ({ person: peopleById.get(transfer.toUserId), amount: transfer.amount }));
  const owed = netted
    .filter((transfer) => transfer.toUserId === userId)
    .map((transfer) => ({ person: peopleById.get(transfer.fromUserId), amount: transfer.amount }));

  return {
    owes,
    owed,
    totalOwes: sum(owes.map((entry) => entry.amount)),
    totalOwed: sum(owed.map((entry) => entry.amount)),
    net: sum(owed.map((e) => e.amount)) - sum(owes.map((e) => e.amount)),
  };
}

/** All players ranked by lifetime net, for the leaderboard screen. */
export async function getLeaderboard() {
  const [users, ledgers] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, username: true, displayName: true, avatarColor: true, role: true },
      orderBy: { displayName: 'asc' },
    }),
    loadLedgers(),
  ]);

  return users
    .map((user) => {
      const rows: PlayerHistoryRow[] = [];
      for (const { game, lines } of ledgers) {
        const line = lines.find((candidate) => candidate.userId === user.id);
        if (!line) continue;
        rows.push({
          gameId: game.id,
          playedOn: game.playedOn.toISOString(),
          title: game.title,
          location: game.location,
          status: game.status,
          playerCount: game.players.length,
          buyIn: line.buyIn,
          cashOut: line.cashOut,
          tableNet: line.tableNet,
          expensePaid: line.expensePaid,
          expenseShare: line.expenseShare,
          net: line.net,
          isWinner: line.isWinner,
        });
      }
      return { ...user, stats: summarise(rows) };
    })
    .sort((a, b) => b.stats.netProfit - a.stats.netProfit);
}

/** Home screen numbers for whoever is signed in. */
export async function getDashboard(userId: string) {
  const [history, balances, gameCount, playerCount, recentGames] = await Promise.all([
    getPlayerHistory(userId),
    getPlayerBalances(userId),
    prisma.game.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.game.findMany({ include: gameInclude, orderBy: { playedOn: 'desc' }, take: 5 }),
  ]);

  return {
    stats: summarise(history),
    balances,
    totals: { games: gameCount, players: playerCount },
    recentGames: recentGames.map(serializeGameSummary),
  };
}
