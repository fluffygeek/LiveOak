import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDb(connectionString: string = process.env.DATABASE_URL ?? '') {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
