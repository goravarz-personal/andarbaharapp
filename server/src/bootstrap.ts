import { prisma } from './lib/prisma';
import { env } from './lib/env';
import { hashPassword } from './lib/password';
import { pickAvatarColor } from './services/user.service';

/**
 * Runs once at startup.
 *
 * Hosted deployments have no convenient shell, so the very first boot has to
 * leave behind an account somebody can actually sign in with. This creates the
 * admin if the database is empty and otherwise leaves everything alone - it
 * never touches an existing account's password.
 */
export async function ensureAdminExists(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { username: env.admin.username },
    select: { id: true },
  });

  if (existing) return;

  const usingDefaultPassword = env.admin.password === 'admin123';

  await prisma.user.create({
    data: {
      username: env.admin.username,
      displayName: env.admin.displayName,
      passwordHash: await hashPassword(env.admin.password),
      role: 'ADMIN',
      // A password that came from a default, rather than one the operator
      // chose, must not survive the first sign-in.
      mustChangePassword: usingDefaultPassword,
      avatarColor: pickAvatarColor(env.admin.username),
    },
  });

  console.log(`Created the admin account "${env.admin.username}".`);
  if (usingDefaultPassword) {
    console.warn(
      'WARNING: ADMIN_PASSWORD was not set, so the password is "admin123". ' +
        'Sign in now and change it - the app will insist.',
    );
  }
}

/** Fails fast and loudly if the database is unreachable. */
export async function checkDatabase(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Could not reach the database. Check DATABASE_URL is right and the database is awake.\n${String(error)}`,
    );
  }
}
