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
        title: 'Valentine special',
        location: "Ravi's place",
        players: [
          { userId: ravi.id, buyIn: rs(2000), cashOut: rs(1000) },
          { userId: meera.id, buyIn: rs(2000), cashOut: rs(3000), isWinner: true },
        ],
        expenses: [
          { label: 'Dinner', amount: rs(600), category: 'DINNER', paidById: ravi.id, splitMode: 'EQUAL' },
        ],
      })
      .expect(201);
    return response.body.game;
  }

  it('records a game with players and expenses in one call', async () => {
    const game = await createGame();

    expect(game.playerCount).toBe(2);
    expect(game.totals).toMatchObject({ buyIn: rs(4000), cashOut: rs(4000), dinner: rs(600) });
    expect(game.balanced).toBe(true);
    expect(game.winners).toHaveLength(1);
    expect(game.winners[0].displayName).toBe('Meera');

    const raviLine = game.players.find((p: { userId: string }) => p.userId === ravi.id);
    // Lost 1000 at the table, fronted 600 of dinner, owes 300 of it.
    expect(raviLine).toMatchObject({ tableNet: rs(-1000), expensePaid: rs(600), expenseShare: rs(300) });
    expect(raviLine.net).toBe(rs(-700));
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

  it('re-splits an equal expense when a latecomer joins', async () => {
    const game = await createGame();
    const arjun = await makeUser('arjun');

    const updated = await request(app)
      .post(`/api/games/${game.id}/players`)
      .set(auth(adminToken))
      .send({ userId: arjun.id, buyIn: rs(2000), cashOut: rs(2000) })
      .expect(201);

    const shares = updated.body.game.players.map((p: { expenseShare: number }) => p.expenseShare);
    expect(shares).toEqual([rs(200), rs(200), rs(200)]);
  });

  it('will not take an expense paid by someone who was not there', async () => {
    const game = await createGame();
    const outsider = await makeUser('outsider');

    const response = await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({ label: 'Cab', amount: rs(300), paidById: outsider.id })
      .expect(400);
    expect(response.body.error.message).toMatch(/one of the players/i);
  });

  it('will not take a custom split that does not add up', async () => {
    const game = await createGame();
    const response = await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({
        label: 'Snacks',
        amount: rs(500),
        paidById: ravi.id,
        splitMode: 'CUSTOM',
        shares: [
          { userId: ravi.id, amount: rs(200) },
          { userId: meera.id, amount: rs(200) },
        ],
      })
      .expect(400);
    expect(response.body.error.message).toMatch(/have to match/i);
  });

  it('flags a game whose cash-outs do not match the buy-ins', async () => {
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
    expect(response.body.game.totals.tableImbalance).toBe(rs(-500));
  });

  it('deletes a game and everything hanging off it', async () => {
    const game = await createGame();
    await request(app).delete(`/api/games/${game.id}`).set(auth(adminToken)).expect(200);

    expect(await prisma.gamePlayer.count({ where: { gameId: game.id } })).toBe(0);
    expect(await prisma.expense.count({ where: { gameId: game.id } })).toBe(0);
    await request(app).get(`/api/games/${game.id}`).set(auth(adminToken)).expect(404);
  });
});

describe('settling up', () => {
  async function settledGame() {
    const created = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({
        playedOn: '2026-03-01T19:00:00.000Z',
        players: [
          { userId: ravi.id, buyIn: rs(2000), cashOut: rs(1000) },
          { userId: meera.id, buyIn: rs(2000), cashOut: rs(3000), isWinner: true },
        ],
      })
      .expect(201);

    const response = await request(app)
      .post(`/api/games/${created.body.game.id}/settle`)
      .set(auth(adminToken))
      .expect(200);
    return response.body.game;
  }

  it('works out who pays whom and marks the game settled', async () => {
    const game = await settledGame();

    expect(game.status).toBe('SETTLED');
    expect(game.settlements).toHaveLength(1);
    expect(game.settlements[0]).toMatchObject({ amount: rs(1000), status: 'PENDING' });
    expect(game.settlements[0].from.displayName).toBe('Ravi');
    expect(game.settlements[0].to.displayName).toBe('Meera');
  });

  it('previews the split without writing anything', async () => {
    const created = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({
        playedOn: new Date().toISOString(),
        players: [
          { userId: ravi.id, buyIn: rs(500), cashOut: rs(0) },
          { userId: meera.id, buyIn: rs(500), cashOut: rs(1000), isWinner: true },
        ],
      })
      .expect(201);

    const preview = await request(app)
      .get(`/api/games/${created.body.game.id}/settlement-preview`)
      .set(auth(playerToken))
      .expect(200);

    expect(preview.body.transfers).toEqual([
      expect.objectContaining({ fromName: 'Ravi', toName: 'Meera', amount: rs(500) }),
    ]);
    expect(await prisma.settlement.count({ where: { gameId: created.body.game.id } })).toBe(0);
  });

  it('replaces generated payments when a game is settled again', async () => {
    const game = await settledGame();

    await request(app)
      .patch(`/api/games/${game.id}/players/${game.players[0].id}`)
      .set(auth(adminToken))
      .send({ cashOut: rs(1500) })
      .expect(200);

    const resettled = await request(app)
      .post(`/api/games/${game.id}/settle`)
      .set(auth(adminToken))
      .expect(200);

    expect(resettled.body.game.settlements).toHaveLength(1);
    expect(resettled.body.game.settlements[0].amount).toBe(rs(500));
  });

  it('refuses to wipe payments already marked paid unless forced', async () => {
    const game = await settledGame();
    const settlementId = game.settlements[0].id;

    // Meera is the one being paid, so she is the one who can confirm it.
    const meeraToken = await login('meera');
    await request(app)
      .patch(`/api/settlements/${settlementId}`)
      .set(auth(meeraToken))
      .send({ status: 'PAID' })
      .expect(200);

    await request(app).post(`/api/games/${game.id}/settle`).set(auth(adminToken)).expect(409);
    await request(app)
      .post(`/api/games/${game.id}/settle?force=true`)
      .set(auth(adminToken))
      .expect(200);
  });

  it('only lets the player being paid confirm a payment', async () => {
    const game = await settledGame();
    const settlementId = game.settlements[0].id;

    // Ravi owes the money - he cannot mark it received.
    await request(app)
      .patch(`/api/settlements/${settlementId}`)
      .set(auth(playerToken))
      .send({ status: 'PAID' })
      .expect(403);

    await request(app)
      .patch(`/api/settlements/${settlementId}`)
      .set(auth(adminToken))
      .send({ status: 'PAID' })
      .expect(200);
  });

  it('records an IOU by hand', async () => {
    const response = await request(app)
      .post('/api/settlements')
      .set(auth(adminToken))
      .send({ fromUserId: ravi.id, toUserId: meera.id, amount: rs(250), note: 'Cab share' })
      .expect(201);

    expect(response.body.settlement).toMatchObject({ kind: 'MANUAL', status: 'PENDING' });
  });

  it('will not let a player owe themselves', async () => {
    await request(app)
      .post('/api/settlements')
      .set(auth(adminToken))
      .send({ fromUserId: ravi.id, toUserId: ravi.id, amount: rs(100) })
      .expect(400);
  });

  it('nets opposing IOUs into one line on the board', async () => {
    await request(app)
      .post('/api/settlements')
      .set(auth(adminToken))
      .send({ fromUserId: ravi.id, toUserId: meera.id, amount: rs(500) })
      .expect(201);
    await request(app)
      .post('/api/settlements')
      .set(auth(adminToken))
      .send({ fromUserId: meera.id, toUserId: ravi.id, amount: rs(200) })
      .expect(201);

    const response = await request(app)
      .get('/api/settlements/outstanding')
      .set(auth(playerToken))
      .expect(200);

    expect(response.body.outstanding).toHaveLength(1);
    expect(response.body.outstanding[0]).toMatchObject({ amount: rs(300) });
    expect(response.body.outstanding[0].from.displayName).toBe('Ravi');
  });

  it('drops a settled IOU off the outstanding board', async () => {
    const game = await settledGame();
    await request(app)
      .patch(`/api/settlements/${game.settlements[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'PAID' })
      .expect(200);

    const response = await request(app)
      .get('/api/settlements/outstanding')
      .set(auth(adminToken))
      .expect(200);
    expect(response.body.outstanding).toHaveLength(0);
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

    const names = response.body.leaderboard.map((row: { displayName: string }) => row.displayName);
    expect(names[0]).toBe('Ravi');
    expect(names[names.length - 1]).toBe('Meera');
  });

  it('sums the dashboard for whoever is signed in', async () => {
    const response = await request(app).get('/api/dashboard').set(auth(playerToken)).expect(200);

    expect(response.body.stats.gamesPlayed).toBe(2);
    expect(response.body.totals).toMatchObject({ games: 2, players: 3 });
    expect(response.body.recentGames).toHaveLength(2);
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
