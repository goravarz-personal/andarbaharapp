import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'See server/.env.example for what each one is for.',
    );
  }
  return value;
}

/** Only safe off the public internet. Production must set its own. */
const developmentSecret = 'aadarbahar-development-secret-change-me-please';

export const env = {
  nodeEnv,
  isProduction,
  isTest,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : developmentSecret),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  /** Where the app is served from. Used for CORS. "*" allows any origin. */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  currency: process.env.CURRENCY ?? 'INR',
  admin: {
    username: (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
    displayName: process.env.ADMIN_DISPLAY_NAME ?? 'Game Admin',
  },
  seedDemoData: (process.env.SEED_DEMO_DATA ?? 'false').toLowerCase() === 'true',
  /**
   * Hosts terminate TLS and forward the real client IP in X-Forwarded-For.
   * Rate limiting is worthless without this, because every request would look
   * like it came from the load balancer.
   */
  trustProxy: Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0)),
};

if (isProduction) {
  if (env.jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (env.jwtSecret === developmentSecret) {
    throw new Error('JWT_SECRET is still the development placeholder. Set a real one.');
  }
  if (env.databaseUrl.startsWith('file:')) {
    throw new Error(
      'DATABASE_URL points at a local SQLite file. Hosted servers wipe their disk on ' +
        'every deploy, so this needs to be a PostgreSQL connection string.',
    );
  }
}
