import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';

export const app: Express = createApp();

/** Wipes every table. Order matters - children before parents. */
export async function resetDb(): Promise<void> {
  await prisma.expenseShare.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.gamePlayer.deleteMany();
  await prisma.game.deleteMany();
  await prisma.user.deleteMany();
}

export async function makeUser(
  username: string,
  role: 'ADMIN' | 'PLAYER' = 'PLAYER',
  password = 'password123',
) {
  return prisma.user.create({
    data: {
      username,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      passwordHash: await hashPassword(password),
      role,
    },
  });
}

export async function login(username: string, password = 'password123'): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);
  return response.body.token as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Rupees to paise, so tests read in the units a human would say out loud. */
export function rs(amount: number): number {
  return Math.round(amount * 100);
}
