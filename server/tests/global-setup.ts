import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TEST_DB = path.join(ROOT, 'prisma', 'test.db');

/**
 * Rebuilds the throwaway SQLite test database before the suite runs. The file
 * is deleted rather than reset in place, so this never touches a real database
 * even if DATABASE_URL is pointed somewhere unexpected.
 */
export default function setup(): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${TEST_DB}${suffix}`, { force: true });
  }

  execSync('npx prisma db push --skip-generate', {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'ignore',
  });
}
