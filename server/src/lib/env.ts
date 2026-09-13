import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isTest = nodeEnv === 'test';

// Tests run against an in-memory-ish scratch DB and never need a real secret.
const devSecret = 'aadarbahar-development-secret-change-me-please';

export const env = {
  nodeEnv,
  isTest,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'file:./aadarbahar.db'),
  jwtSecret: required('JWT_SECRET', nodeEnv === 'production' ? undefined : devSecret),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  currency: process.env.CURRENCY ?? 'INR',
  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
    displayName: process.env.ADMIN_DISPLAY_NAME ?? 'Game Admin',
  },
  seedDemoData: (process.env.SEED_DEMO_DATA ?? 'false').toLowerCase() === 'true',
};

if (env.isProduction && env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}
