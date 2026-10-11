import pg from 'pg';

const { Pool } = pg;

export interface DatabaseAdapter {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  withTransaction: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>;
  end: () => Promise<void>;
  isInMemory: boolean;
}

let dbAdapter: DatabaseAdapter | null = null;

export async function initDatabase(connectionString?: string): Promise<DatabaseAdapter> {
  if (dbAdapter && !connectionString) {
    return dbAdapter;
  }

  const url = connectionString || process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL environment variable is not defined. Real PostgreSQL persistence is strictly required.'
    );
  }

  try {
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    const client = await pool.connect();
    client.release();

    const sanitizedUrl = url.replace(/:[^:@]+@/, ':***@');
    console.log(`[Database] Connected to PostgreSQL at ${sanitizedUrl}`);

    // Create documents table with binary BYTEA Yjs payload
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(255) PRIMARY KEY,
        data BYTEA NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const adapter: DatabaseAdapter = {
      query: (text, params) => pool.query(text, params),
      withTransaction: async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
        const txClient = await pool.connect();
        try {
          await txClient.query('BEGIN');
          const result = await fn(txClient);
          await txClient.query('COMMIT');
          return result;
        } catch (err) {
          await txClient.query('ROLLBACK');
          throw err;
        } finally {
          txClient.release();
        }
      },
      end: () => pool.end(),
      isInMemory: false,
    };

    if (!connectionString) {
      dbAdapter = adapter;
    }

    return adapter;
  } catch (error) {
    console.error(
      '[Database] Fatal: Unable to connect to PostgreSQL database:',
      (error as Error).message
    );
    throw error;
  }
}

export function getDatabaseAdapter(): DatabaseAdapter {
  if (!dbAdapter) {
    throw new Error('Database adapter not initialized. Call initDatabase() first.');
  }
  return dbAdapter;
}
