import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';

export type DbClient = PrismaClient;

export const createDb = (config: AppConfig): PrismaClient => new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  log: config.logLevel === 'debug' ? ['warn', 'error'] : ['error'],
});

export const closeDb = async (db: PrismaClient): Promise<void> => {
  await db.$disconnect();
};
