import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // SQLite plus a shared schema means tests must not race each other.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    globalSetup: './tests/global-setup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'test-secret-that-is-definitely-long-enough-123456',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin123',
    },
    include: ['tests/**/*.test.ts'],
  },
});
