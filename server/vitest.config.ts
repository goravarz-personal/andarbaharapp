import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './tests/db-url';

export default defineConfig({
  test: {
    // One shared database means tests must not race each other.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    globalSetup: './tests/global-setup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret-that-is-definitely-long-enough-123456',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin123',
    },
    include: ['tests/**/*.test.ts'],
  },
});
