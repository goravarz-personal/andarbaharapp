/**
 * The one place the test database address is decided, so the migration step
 * and the tests themselves cannot disagree about which database they mean.
 *
 * Point TEST_DATABASE_URL at your own Postgres to run the suite elsewhere.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://aadar:aadar@127.0.0.1:5432/aadarbahar_test';
