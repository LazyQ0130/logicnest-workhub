import { buildApp } from './app.js';
import { parseConfig } from './config.js';

const config = parseConfig();
const app = await buildApp(config);

const close = async (signal: string) => {
  app.log.info({ signal }, '[license-server] shutting down');
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port }, '[license-server] listening');
} catch (error) {
  app.log.error({ err: error }, '[license-server] failed to start');
  process.exitCode = 1;
}
