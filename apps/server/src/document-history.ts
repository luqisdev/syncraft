import crypto from 'crypto';
import * as Y from 'yjs';
import { DatabaseAdapter } from './db.js';
import { generateId } from './auth.js';

export type CheckpointKind = 'manual' | 'automatic' | 'pre_restore';

export interface DocumentCheckpoint {
  id: string;
  document_id: string;
  workspace_id: string;
  kind: CheckpointKind;
  label: string | null;
  created_by: string | null;
  creator_name?: string | null;
  creator_email?: string | null;
  content_hash: string;
  summary_text: string;
  created_at: string;
}

export interface CheckpointDetail extends DocumentCheckpoint {
  snapshot_data: Buffer;
}

/**
 * Recursively extract plain text from Yjs XML structure (used by Tiptap Collaboration)
 */
export function extractPlainTextFromDoc(doc: Y.Doc): string {
  const frag = doc.getXmlFragment('default');
  return extractPlainTextFromNode(frag).trim();
}

function extractPlainTextFromNode(node: any): string {
  if (!node) return '';
  if (node instanceof Y.XmlText) {
    return node.toString();
  }
  if (node instanceof Y.XmlElement) {
    let text = '';
    for (let i = 0; i < node.length; i++) {
      text += extractPlainTextFromNode(node.get(i));
    }
    return text + '\n';
  }
  if (node instanceof Y.XmlFragment) {
    let text = '';
    for (let i = 0; i < node.length; i++) {
      text += extractPlainTextFromNode(node.get(i));
    }
    return text;
  }
  return '';
}

/**
 * Compute canonical content hash of the document structure.
 * We hash the XML fragment representation to detect actual content changes.
 */
export function computeContentHash(doc: Y.Doc): string {
  const frag = doc.getXmlFragment('default');
  const xmlString = frag.toJSON();
  return crypto.createHash('sha256').update(xmlString).digest('hex');
}

/**
 * Create a document checkpoint from an authoritative Y.Doc.
 */
export async function createDocumentCheckpoint(
  db: DatabaseAdapter,
  params: {
    documentId: string;
    workspaceId: string;
    kind: CheckpointKind;
    label?: string | null;
    createdBy?: string | null;
    doc: Y.Doc;
    skipIfUnchanged?: boolean;
  }
): Promise<DocumentCheckpoint | null> {
  const contentHash = computeContentHash(params.doc);
  const plainText = extractPlainTextFromDoc(params.doc);

  if (params.skipIfUnchanged) {
    // Check if the latest checkpoint for this document has the exact same content_hash
    const latest = await db.query(
      `SELECT content_hash FROM document_checkpoints
       WHERE document_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.documentId]
    );
    if (latest.rows.length > 0 && latest.rows[0].content_hash === contentHash) {
      return null; // No change, skip creating duplicate checkpoint
    }
  }

  // Encode the entire authoritative doc state as update buffer
  const updateData = Buffer.from(Y.encodeStateAsUpdate(params.doc));
  const checkpointId = generateId();

  // Automatic checkpoints must never be falsely attributed to an arbitrary single editor
  const createdBy = params.kind === 'automatic' ? null : (params.createdBy || null);

  // Ensure document row exists in documents table before creating checkpoint
  await db.query(
    `INSERT INTO documents (id, data, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    [params.documentId, updateData]
  );

  const res = await db.query(
    `INSERT INTO document_checkpoints (
       id, document_id, workspace_id, kind, label, created_by,
       content_hash, snapshot_data, summary_text, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
     RETURNING id, document_id, workspace_id, kind, label, created_by,
               content_hash, summary_text, created_at`,
    [
      checkpointId,
      params.documentId,
      params.workspaceId,
      params.kind,
      params.label || null,
      createdBy,
      contentHash,
      updateData,
      plainText.slice(0, 1000), // First 1000 chars as quick text summary
    ]
  );

  const checkpoint = res.rows[0];
  if (checkpoint.created_by) {
    const userRes = await db.query(`SELECT name, email FROM users WHERE id = $1`, [checkpoint.created_by]);
    if (userRes.rows.length > 0) {
      checkpoint.creator_name = userRes.rows[0].name;
      checkpoint.creator_email = userRes.rows[0].email;
    }
  }

  return checkpoint;
}

/**
 * List checkpoints for a document (paginated).
 */
export async function listDocumentCheckpoints(
  db: DatabaseAdapter,
  documentId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ checkpoints: DocumentCheckpoint[]; total: number }> {
  const countRes = await db.query(
    `SELECT COUNT(*) as total FROM document_checkpoints WHERE document_id = $1`,
    [documentId]
  );
  const total = parseInt(countRes.rows[0].total, 10);

  const res = await db.query(
    `SELECT c.id, c.document_id, c.workspace_id, c.kind, c.label, c.created_by,
            c.content_hash, c.summary_text, c.created_at,
            u.name as creator_name, u.email as creator_email
     FROM document_checkpoints c
     LEFT JOIN users u ON c.created_by = u.id
     WHERE c.document_id = $1
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [documentId, limit, offset]
  );

  return {
    checkpoints: res.rows,
    total,
  };
}

/**
 * List completed restorations for a document (ordered newest first).
 */
export async function listDocumentRestorations(
  db: DatabaseAdapter,
  documentId: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  document_id: string;
  checkpoint_id: string;
  pre_restore_id: string;
  restored_by: string | null;
  revision: number;
  restored_at: string;
}>> {
  const res = await db.query(
    `SELECT id, document_id, checkpoint_id, pre_restore_id, restored_by, revision, restored_at
     FROM document_restorations
     WHERE document_id = $1
     ORDER BY revision DESC, restored_at DESC
     LIMIT $2`,
    [documentId, limit]
  );
  return res.rows;
}

/**
 * Get checkpoint detail with snapshot binary data.
 */
export async function getCheckpointDetail(
  db: DatabaseAdapter,
  checkpointId: string
): Promise<CheckpointDetail | null> {
  const res = await db.query(
    `SELECT c.id, c.document_id, c.workspace_id, c.kind, c.label, c.created_by,
            c.content_hash, c.snapshot_data, c.summary_text, c.created_at,
            u.name as creator_name, u.email as creator_email
     FROM document_checkpoints c
     LEFT JOIN users u ON c.created_by = u.id
     WHERE c.id = $1`,
    [checkpointId]
  );

  if (res.rows.length === 0) return null;
  return res.rows[0];
}

// Per-document restore execution lock to serialize concurrent restore operations
const documentRestoreLocks = new Map<string, Promise<void>>();

async function acquireDocumentRestoreLock(documentId: string): Promise<() => void> {
  while (documentRestoreLocks.has(documentId)) {
    await documentRestoreLocks.get(documentId);
  }
  let release: () => void = () => { };
  const lockPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  documentRestoreLocks.set(documentId, lockPromise);
  return () => {
    documentRestoreLocks.delete(documentId);
    release();
  };
}

/**
 * Safely restore a historical checkpoint onto the live authoritative Y.Doc.
 *
 * 1. Checks that the expectedBaseHash matches the live doc's current hash (guards against stale confirmation).
 * 2. Serializes restore operations per document.
 * 3. Creates a pre-restore checkpoint to allow reversing the restore.
 * 4. Re-checks the expectedBaseHash right before the transaction to prevent race conditions during DB work.
 * 5. Replaces the live XML fragment contents with the snapshot's XML fragment contents inside a single atomic Yjs transaction.
 * 6. Persists the new state to PostgreSQL documents table.
 */
export async function restoreDocumentCheckpoint(
  db: DatabaseAdapter,
  params: {
    documentId: string;
    workspaceId: string;
    checkpointId: string;
    userId: string;
    expectedBaseHash: string;
    liveDoc: Y.Doc;
    idempotencyKey?: string | null;
  }
): Promise<{ success: boolean; preRestoreCheckpointId: string; newHash: string; restorationId?: string; revision?: number }> {
  const releaseLock = await acquireDocumentRestoreLock(params.documentId);
  try {
    // Idempotency check
    if (params.idempotencyKey) {
      const existing = await db.query(
        `SELECT checkpoint_id, pre_restore_id FROM restore_idempotency_keys WHERE client_key = $1`,
        [params.idempotencyKey]
      );
      if (existing.rows.length > 0) {
        const currentHash = computeContentHash(params.liveDoc);
        return {
          success: true,
          preRestoreCheckpointId: existing.rows[0].pre_restore_id,
          newHash: currentHash,
        };
      }
    }

    // 1. Validate checkpoint exists and matches document
    const checkpoint = await getCheckpointDetail(db, params.checkpointId);
    if (!checkpoint || checkpoint.document_id !== params.documentId) {
      throw new Error('Checkpoint not found for this document');
    }

    // 2. Initial concurrency guard: verify current live doc matches expectedBaseHash
    const initialLiveHash = computeContentHash(params.liveDoc);
    if (params.expectedBaseHash && params.expectedBaseHash !== initialLiveHash) {
      throw new Error('DOCUMENT_MODIFIED_CONFLICT');
    }

    // 3. Create pre-restore checkpoint of current state
    const preRestoreCheckpoint = await createDocumentCheckpoint(db, {
      documentId: params.documentId,
      workspaceId: params.workspaceId,
      kind: 'pre_restore',
      label: `Pre-restore snapshot before reverting to "${checkpoint.label || checkpoint.created_at}"`,
      createdBy: params.userId,
      doc: params.liveDoc,
      skipIfUnchanged: false,
    });

    if (!preRestoreCheckpoint) {
      throw new Error('Failed to create pre-restore checkpoint');
    }

    // 4. Strict boundary re-check: verify that no collaborator edited the live document while awaiting pre-restore DB insertion
    const currentLiveHashBeforeMutate = computeContentHash(params.liveDoc);
    if (params.expectedBaseHash && params.expectedBaseHash !== currentLiveHashBeforeMutate) {
      throw new Error('DOCUMENT_MODIFIED_CONFLICT');
    }

    // 5. Decode snapshot into a temporary Y.Doc
    const snapshotDoc = new Y.Doc();
    Y.applyUpdate(snapshotDoc, new Uint8Array(checkpoint.snapshot_data));

    // 6. Mutate live document in an atomic Yjs transaction
    const liveFrag = params.liveDoc.getXmlFragment('default');
    const snapFrag = snapshotDoc.getXmlFragment('default');

    params.liveDoc.transact(() => {
      while (liveFrag.length > 0) {
        liveFrag.delete(0, 1);
      }
      for (let i = 0; i < snapFrag.length; i++) {
        liveFrag.push([snapFrag.get(i).clone()]);
      }
    });

    // 6. Persist restored state immediately to PostgreSQL documents table
    const updatedBuffer = Buffer.from(Y.encodeStateAsUpdate(params.liveDoc));
    await db.query(
      `INSERT INTO documents (id, data, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (id)
     DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP`,
      [params.documentId, updatedBuffer]
    );

    // 7. Store idempotency key if provided
    if (params.idempotencyKey) {
      await db.query(
        `INSERT INTO restore_idempotency_keys (client_key, document_id, checkpoint_id, pre_restore_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_key) DO NOTHING`,
        [params.idempotencyKey, params.documentId, params.checkpointId, preRestoreCheckpoint.id]
      );
    }

    // 8. Record verified completed restoration in document_restorations log with advancing authoritative revision
    const restorationId = crypto.randomUUID();
    const revRes = await db.query(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS next_rev FROM document_restorations WHERE document_id = $1`,
      [params.documentId]
    );
    const nextRevision = parseInt(revRes.rows[0]?.next_rev || '1', 10);

    await db.query(
      `INSERT INTO document_restorations (id, document_id, checkpoint_id, pre_restore_id, restored_by, revision, restored_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [restorationId, params.documentId, params.checkpointId, preRestoreCheckpoint.id, params.userId, nextRevision]
    );

    const finalHash = computeContentHash(params.liveDoc);
    return {
      success: true,
      restorationId,
      revision: nextRevision,
      preRestoreCheckpointId: preRestoreCheckpoint.id,
      newHash: finalHash,
    };
  } finally {
    releaseLock();
  }
}
