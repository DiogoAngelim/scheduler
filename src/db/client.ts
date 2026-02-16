import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export interface PgClient {
  pool: Pool;
  db: NodePgDatabase<Record<string, never>>;
}

export function createPgClient(databaseUrl: string): PgClient {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000
  });

  return {
    pool,
    db: drizzle(pool)
  };
}
