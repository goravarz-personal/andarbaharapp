import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Readable temporary password for a freshly added player. */
export function generateTempPassword(): string {
  const words = ['andar', 'bahar', 'joker', 'trump', 'stack', 'river', 'blind', 'chips'];
  const word = words[Math.floor(Math.random() * words.length)] ?? 'andar';
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${word}${digits}`;
}
