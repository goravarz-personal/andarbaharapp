import { execSync } from 'node:child_process';
import path from 'node:path';
import { TEST_DATABASE_URL } from './db-url';

const ROOT = path.resolve(__dirname, '..');

/**
 * Brings the throwaway test database up to the current schema. It applies the
 * same migrations production applies, so a migration that would fail on the
 * host fails here first.
 */
export default function setup(): void {
  try {
    execSync('npx prisma migrate deploy', {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (error) {
    const details = error instanceof Error && 'stdout' in error ? String(error.stdout) : String(error);
    throw new Error(
      `Could not prepare the test database at ${TEST_DATABASE_URL}.\n` +
        'Start one with `docker compose up -d` from the repo root, or set ' +
        'TEST_DATABASE_URL to a database you already have.\n\n' +
        details,
    );
  }
}
