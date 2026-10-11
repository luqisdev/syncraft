import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';
import dotenv from 'dotenv';
import { createHocuspocusServer } from '../src/index.js';
import { initDatabase } from '../src/db.js';

// Load environment variables
dotenv.config({ path: '../../.env' });

const TEST_DB_URL = process.env.TEST_DATABASE_URL || '';
if (!TEST_DB_URL) {
  throw new Error('TEST_DATABASE_URL environment variable must be set.');
}

describe('Server Restart & Native PostgreSQL Persistence Verification', () => {
  it('should restore document state from native PostgreSQL after a server restart', async () => {
    // 1. Connect to isolated test database
    const db = await initDatabase(TEST_DB_URL);
    assert.strictEqual(
      db.isInMemory,
      false,
      'Persistence must use real PostgreSQL, not an in-memory database'
    );

    const docId = `real-restart-test-doc-${Date.now()}`;

    // 2. Initial server instance simulates Server 1
    const serverInstance1 = await createHocuspocusServer(db);

    // Create a Yjs document with content as a connected client would
    const clientDoc1 = new Y.Doc();
    const ytext1 = clientDoc1.getText('default');
    ytext1.insert(0, 'Critical document state persisted in native PostgreSQL before restart.');

    // Store update in PostgreSQL using onStoreDocument hook
    const onStore1 = serverInstance1.configuration.onStoreDocument;
    assert.ok(onStore1, 'onStoreDocument handler must exist');
    await onStore1({
      documentName: docId,
      document: clientDoc1,
      requestHeaders: {},
      requestParameters: new URLSearchParams(),
      connection: {} as any,
    });

    // Verify row actually exists in PostgreSQL
    const res = await db.query('SELECT data FROM documents WHERE id = $1', [docId]);
    assert.strictEqual(res.rows.length, 1, 'Document row must exist in PostgreSQL');
    assert.ok(
      Buffer.isBuffer(res.rows[0].data),
      'Stored data in PostgreSQL must be a binary BYTEA buffer'
    );

    // 3. Simulate complete server shutdown
    await serverInstance1.destroy();

    // 4. Start a brand new Server instance simulating Server 2 after restart
    const serverInstance2 = await createHocuspocusServer(db);

    // Load document using Server 2's onLoadDocument hook
    const onLoad = serverInstance2.configuration.onLoadDocument;
    assert.ok(onLoad, 'onLoadDocument handler must exist');

    const loadedDoc = await onLoad({
      documentName: docId,
      document: new Y.Doc(),
      requestHeaders: {},
      requestParameters: new URLSearchParams(),
      connection: {} as any,
    });

    assert.ok(loadedDoc, 'Loaded Y.Doc must exist');
    const loadedText = loadedDoc.getText('default').toString();

    assert.strictEqual(
      loadedText,
      'Critical document state persisted in native PostgreSQL before restart.',
      'Content restored from native PostgreSQL must exactly match the state before server restart'
    );

    // 5. Clean up
    await db.query('DELETE FROM documents WHERE id = $1', [docId]);
    await serverInstance2.destroy();
    await db.end();
  });
});
