import { createApp } from './app';
import { env } from './lib/env';
import { disconnectPrisma } from './lib/prisma';
import { checkDatabase, ensureAdminExists } from './bootstrap';

async function main(): Promise<void> {
  await checkDatabase();
  await ensureAdminExists();

  const app = createApp();

  // Hosts hand the port over in an environment variable and expect the process
  // to listen on every interface, not just loopback.
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`AadarBahar API listening on port ${env.port} (${env.nodeEnv})`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received, shutting down.`);
    server.close();
    await disconnectPrisma();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error) => {
  console.error('Failed to start:', error instanceof Error ? error.message : error);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
