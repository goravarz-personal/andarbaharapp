import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, auth, login, makeUser, resetDb, rs } from './helpers';
import { prisma } from '../src/lib/prisma';

let adminToken: string;
let playerToken: string;
let admin: Awaited<ReturnType<typeof makeUser>>;
let ravi: Awaited<ReturnType<typeof makeUser>>;
let meera: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  await resetDb();
  admin = await makeUser('admin', 'ADMIN');
  ravi = await makeUser('ravi');
  meera = await makeUser('meera');
  adminToken = await login('admin');
  playerToken = await login('ravi');
});

describe('auth', () => {
  it('signs a player in and hands back a token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ravi', password: 'password123' })
      .expect(200);

    expect(response.body.token).toBeTruthy();
    expect(response.body.user).toMatchObject({ username: 'ravi', role: 'PLAYER' });
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('is case-insensitive about the username', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'RAVI', password: 'password123' })
      .expect(200);
  });

  it('rejects a wrong password without saying which part was wrong', async () => {
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ravi', password: 'nope' })
      .expect(401);
    const missing = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'nope' })
      .expect(401);

    expect(bad.body.error.message).toBe(missing.body.error.message);
  });

  it('turns away a deactivated player', async () => {
    await prisma.user.update({ where: { id: ravi.id }, data: { isActive: false } });
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'ravi', password: 'password123' })
      .expect(403);
  });

  it('needs a token for anything else', async () => {
    await request(app).get('/api/games').expect(401);
    await request(app).get('/api/players').expect(401);
  });

  it('retires old tokens after a password change', async () => {
    const stale = playerToken;
    await request(app)
      .post('/api/auth/change-password')
      .set(auth(stale))
      .send({ currentPassword: 'password123', newPassword: 'brandnew123' })
      .expect(200);

    await request(app).get('/api/games').set(auth(stale)).expect(401);
    await login('ravi', 'brandnew123');
  });
});

describe('players', () => {
  it('lets an admin add a player and returns a one-time password', async () => {
    const response = await request(app)
      .post('/api/players')
      .set(auth(adminToken))
      .send({ username: 'arjun', displayName: 'Arjun' })
      .expect(201);

    expect(response.body.temporaryPassword).toBeTruthy();
    expect(response.body.player.mustChangePassword).toBe(true);
    await login('arjun', response.body.temporaryPassword);
  });

  it('stops a player from adding players', async () => {
    await request(app)
      .post('/api/players')
      .set(auth(playerToken))
      .send({ username: 'sneaky', displayName: 'Sneaky' })
      .expect(403);
  });

  it('refuses a duplicate username', async () => {
    await request(app)
      .post('/api/players')
      .set(auth(adminToken))
      .send({ username: 'ravi', displayName: 'Another Ravi' })
      .expect(409);
  });

  it('validates the username format', async () => {
    const response = await request(app)
      .post('/api/players')
      .set(auth(adminToken))
      .send({ username: 'has spaces!', displayName: 'Nope' })
      .expect(400);
    expect(response.body.error.details.username).toBeTruthy();
  });

  it('lets every player see the whole roster', async () => {
    const response = await request(app).get('/api/players').set(auth(playerToken)).expect(200);
    expect(response.body.players).toHaveLength(3);
  });

  it('will not let the last admin be demoted', async () => {
    const response = await request(app)
      .patch(`/api/players/${admin.id}`)
      .set(auth(adminToken))
      .send({ role: 'PLAYER' })
      .expect(400);
    expect(response.body.error.message).toMatch(/own admin access/i);
  });

  it('deactivates rather than deletes a player with history', async () => {
    const game = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({ playedOn: new Date().toISOString(), players: [{ userId: ravi.id, buyIn: rs(100) }] })
      .expect(201);
    expect(game.body.game.players).toHaveLength(1);

    const response = await request(app)
      .delete(`/api/players/${ravi.id}`)
      .set(auth(adminToken))
      .expect(200);

    expect(response.body.deactivated).toBe(true);
    expect(await prisma.user.count({ where: { id: ravi.id } })).toBe(1);
  });

  it('hard-deletes a player who never played', async () => {
    await request(app).delete(`/api/players/${meera.id}`).set(auth(adminToken)).expect(200);
    expect(await prisma.user.count({ where: { id: meera.id } })).toBe(0);
  });

  it('resets a password and signs the old session out', async () => {
    const response = await request(app)
      .post(`/api/players/${ravi.id}/reset-password`)
      .set(auth(adminToken))
      .send({})
      .expect(200);

    await request(app).get('/api/games').set(auth(playerToken)).expect(401);
    await login('ravi', response.body.password);
  });
});

describe('games', () => {
  async function createGame() {
    const response = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({
        playedOn: '2026-02-14T19:30:00.000Z',
        title: 'Saturday-Regular',
        location: 'Katte Room',
        players: [
          // 4000 of chips out, 4000 back in.
          { userId: ravi.id, buyIn: rs(2000), cashOut: rs(1400), isBanker: true },
          { userId: meera.id, buyIn: rs(2000), cashOut: rs(2600) },
        ],
        expenses: [{ type: 'DINNER', label: 'Dinner', amount: rs(200) }],
      })
      .expect(201);
    return response.body.game;
  }

  it('records the chips, the banker, and what the night cost', async () => {
    const game = await createGame();

    expect(game.playerCount).toBe(2);
    expect(game.totals).toMatchObject({ buyIn: rs(4000), cashOut: rs(4000), dinner: rs(200) });
    expect(game.balanced).toBe(true);
    expect(game.banker.displayName).toBe('Ravi');
  });

  it('works out the winner from the numbers, with nobody marking anything', async () => {
    const game = await createGame();
    expect(game.topWinner.displayName).toBe('Meera');

    const meera = game.players.find((p: { userId: string }) => p.userId === meera_id());
    expect(meera).toMatchObject({ tableNet: rs(600), expenseShare: rs(200), net: rs(400) });
    expect(meera.isTopWinner).toBe(true);
    function meera_id() {
      return game.players.find((p: { displayName: string }) => p.displayName === 'Meera').userId;
    }
  });

  it('puts dinner on the top winner without being told who', async () => {
    const game = await createGame();
    const dinner = game.expenses.find((e: { type: string }) => e.type === 'DINNER');
    expect(dinner.carriedBy).toHaveLength(1);
    expect(dinner.carriedBy[0].displayName).toBe('Meera');
  });

  it('moves the dinner bill when a corrected cash-out changes who won', async () => {
    const game = await createGame();
    const raviSeat = game.players.find((p: { userId: string }) => p.userId === ravi.id);

    // Ravi actually finished with far more than was first typed in.
    const updated = await request(app)
      .patch(`/api/games/${game.id}/players/${raviSeat.id}`)
      .set(auth(adminToken))
      .send({ cashOut: rs(3000) })
      .expect(200);

    expect(updated.body.game.topWinner.displayName).toBe('Ravi');
    const dinner = updated.body.game.expenses.find((e: { type: string }) => e.type === 'DINNER');
    expect(dinner.carriedBy[0].displayName).toBe('Ravi');
  });

  it('splits a non-dinner cost between whoever chipped in', async () => {
    const game = await createGame();
    const response = await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({ type: 'CARDS', label: 'New decks', amount: rs(300), shareUserIds: [ravi.id, meera.id] })
      .expect(201);

    const cards = response.body.game.expenses.find((e: { type: string }) => e.type === 'CARDS');
    expect(cards.carriedBy).toHaveLength(2);
    const ravRow = response.body.game.players.find((p: { userId: string }) => p.userId === ravi.id);
    expect(ravRow.expenseShare).toBe(rs(150));
  });

  it('insists a non-dinner cost names who is covering it', async () => {
    const game = await createGame();
    const response = await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({ type: 'TRAVEL', amount: rs(300) })
      .expect(400);
    expect(response.body.error.message).toMatch(/who is covering/i);
  });

  it('will not let someone outside the game carry a cost', async () => {
    const game = await createGame();
    const outsider = await makeUser('outsider');

    const response = await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({ type: 'TRAVEL', amount: rs(300), shareUserIds: [outsider.id] })
      .expect(400);
    expect(response.body.error.message).toMatch(/player in this game/i);
  });

  it('flags a night where the chips do not add up', async () => {
    const response = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({
        playedOn: new Date().toISOString(),
        players: [
          { userId: ravi.id, buyIn: rs(1000), cashOut: rs(500) },
          { userId: meera.id, buyIn: rs(1000), cashOut: rs(1000) },
        ],
      })
      .expect(201);

    expect(response.body.game.balanced).toBe(false);
    expect(response.body.game.totals.difference).toBe(rs(500));
  });

  it('keeps at most one banker', async () => {
    const game = await createGame();
    const meeraSeat = game.players.find((p: { userId: string }) => p.userId === meera.id);

    const updated = await request(app)
      .patch(`/api/games/${game.id}/players/${meeraSeat.id}`)
      .set(auth(adminToken))
      .send({ isBanker: true })
      .expect(200);

    expect(updated.body.game.players.filter((p: { isBanker: boolean }) => p.isBanker)).toHaveLength(1);
    expect(updated.body.game.banker.displayName).toBe('Meera');
  });

  it('lets a player read games but not create them', async () => {
    await createGame();
    const list = await request(app).get('/api/games').set(auth(playerToken)).expect(200);
    expect(list.body.games).toHaveLength(1);

    await request(app)
      .post('/api/games')
      .set(auth(playerToken))
      .send({ playedOn: new Date().toISOString() })
      .expect(403);
  });

  it('rejects the same player twice at one table', async () => {
    await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({
        playedOn: new Date().toISOString(),
        players: [{ userId: ravi.id }, { userId: ravi.id }],
      })
      .expect(400);
  });

  it('deletes a game and everything hanging off it', async () => {
    const game = await createGame();
    await request(app).delete(`/api/games/${game.id}`).set(auth(adminToken)).expect(200);

    expect(await prisma.gamePlayer.count({ where: { gameId: game.id } })).toBe(0);
    expect(await prisma.expense.count({ where: { gameId: game.id } })).toBe(0);
    await request(app).get(`/api/games/${game.id}`).set(auth(adminToken)).expect(404);
  });
});

describe('history and stats', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({
        playedOn: '2026-01-10T19:00:00.000Z',
        players: [
          { userId: ravi.id, buyIn: rs(1000), cashOut: rs(1600), isWinner: true },
          { userId: meera.id, buyIn: rs(1000), cashOut: rs(400) },
        ],
      })
      .expect(201);
    await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({
        playedOn: '2026-01-24T19:00:00.000Z',
        players: [
          { userId: ravi.id, buyIn: rs(1000), cashOut: rs(800) },
          { userId: meera.id, buyIn: rs(1000), cashOut: rs(1200), isWinner: true },
        ],
      })
      .expect(201);
  });

  it('gives a player their full playing history', async () => {
    const response = await request(app)
      .get(`/api/players/${ravi.id}/history`)
      .set(auth(playerToken))
      .expect(200);

    expect(response.body.history).toHaveLength(2);
    // Newest first.
    expect(response.body.history[0].playedOn.startsWith('2026-01-24')).toBe(true);
    expect(response.body.stats).toMatchObject({
      gamesPlayed: 2,
      wins: 1,
      winRate: 50,
      netProfit: rs(400),
      bestGame: rs(600),
      worstGame: rs(-200),
    });
  });

  it('ranks the roster by lifetime net', async () => {
    const response = await request(app)
      .get('/api/players/leaderboard')
      .set(auth(playerToken))
      .expect(200);

    const rows = response.body.leaderboard as Array<{
      displayName: string;
      stats: { gamesPlayed: number };
    }>;

    const played = rows.filter((row) => row.stats.gamesPlayed > 0).map((row) => row.displayName);
    expect(played[0]).toBe('Ravi');
    expect(played[played.length - 1]).toBe('Meera');

    // Somebody who has never sat down does not lead the table on nil.
    expect(rows[rows.length - 1]?.displayName).toBe('Admin');
    expect(rows[rows.length - 1]?.stats.gamesPlayed).toBe(0);
  });

  it('sums the dashboard for whoever is signed in', async () => {
    const response = await request(app).get('/api/dashboard').set(auth(playerToken)).expect(200);

    expect(response.body.stats.gamesPlayed).toBe(2);
    expect(response.body.totals).toMatchObject({ games: 2, players: 3 });
    expect(response.body.recentGames).toHaveLength(2);
    expect(response.body.balances).toBeUndefined();
  });

  it('filters the games list by player', async () => {
    const arjun = await makeUser('arjun');
    const all = await request(app).get('/api/games').set(auth(playerToken)).expect(200);
    const forArjun = await request(app)
      .get(`/api/games?playerId=${arjun.id}`)
      .set(auth(playerToken))
      .expect(200);

    expect(all.body.games).toHaveLength(2);
    expect(forArjun.body.games).toHaveLength(0);
  });
});
