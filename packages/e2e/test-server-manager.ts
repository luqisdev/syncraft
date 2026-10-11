import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TestServerInstance {
  port: number;
  process: ChildProcess;
  databaseUrl: string;
  stop: () => Promise<void>;
  restart: () => Promise<TestServerInstance>;
}

export function validateTestDatabaseUrl(url: string): void {
  if (!url) {
    throw new Error('SAFETY VIOLATION: DATABASE_URL is not set for test execution.');
  }
  let dbName: string;
  try {
    const parsed = new URL(url);
    dbName = parsed.pathname.replace(/^\//, '');
  } catch {
    const match = url.match(/\/([^/?#]+)(?:[?#]|$)/);
    dbName = match ? match[1] : '';
  }

  if (dbName !== 'syncraft_test') {
    throw new Error(
      `SAFETY VIOLATION: Automated tests are strictly required to run against exact database 'syncraft_test', but received '${dbName}' from url '${url}'. Aborting test execution to protect development database.`
    );
  }
}

export async function cleanTestDocument(databaseUrl: string, docId: string): Promise<void> {
  validateTestDatabaseUrl(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('DELETE FROM documents WHERE id = $1', [docId]);
  } finally {
    await client.end();
  }
}

export async function verifyDocumentSavedInPostgres(
  databaseUrl: string,
  docId: string
): Promise<boolean> {
  validateTestDatabaseUrl(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const res = await client.query('SELECT octet_length(data) as len FROM documents WHERE id = $1', [
      docId,
    ]);
    return res.rows.length > 0 && res.rows[0].len > 0;
  } finally {
    await client.end();
  }
}

export async function startIsolatedServer(
  port: number,
  databaseUrl: string
): Promise<TestServerInstance> {
  validateTestDatabaseUrl(databaseUrl);

  const serverDir = path.resolve(__dirname, '../../apps/server');
  const serverScript = path.resolve(serverDir, 'dist/index.js');

  const child = spawn(process.execPath, [serverScript], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait until server reports listening
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Test server on port ${port} timed out during startup`));
    }, 15000);

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('listening on ws://') || text.includes('Hocuspocus')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr?.on('data', (data) => {
      console.error(`[TestServer ${port} stderr]:`, data.toString());
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Test server exited prematurely with code ${code}`));
      }
    });
  });

  const stop = async (): Promise<void> => {
    if (child.pid && !child.killed) {
      try {
        // On Windows, taskkill /F /T /PID terminates the process and its tree
        const { execSync } = await import('child_process');
        execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
      } catch {
        child.kill('SIGKILL');
      }
    }
  };

  const restart = async (): Promise<TestServerInstance> => {
    await stop();
    // Allow small pause for port reuse
    await new Promise((r) => setTimeout(r, 500));
    // Start fresh process on same port and test database
    return startIsolatedServer(port, databaseUrl);
  };

  return {
    port,
    process: child,
    databaseUrl,
    stop,
    restart,
  };
}
