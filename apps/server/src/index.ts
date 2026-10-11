import dotenv from 'dotenv';
import {
  Hocuspocus,
  onConnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
  onDisconnectPayload,
  onAuthenticatePayload,
  beforeHandleMessagePayload,
  onRequestPayload,
} from '@hocuspocus/server';
import * as Y from 'yjs';
import { initDatabase, DatabaseAdapter } from './db.js';
import { runMigrations } from './migrations.js';
import { handleHttpApi, parseCookies } from './routes.js';
import { validateSession } from './auth.js';
import { getDocumentAccess, WorkspaceRole, getUserRoleInWorkspace } from './workspaces.js';
import { boardEventManager } from './board-events.js';
import { createDocumentCheckpoint } from './document-history.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';

export interface HocuspocusContext {
  user: {
    id: string;
    name: string;
    email: string;
  };
  sessionId: string;
  role: WorkspaceRole;
  workspaceId: string;
}

export interface ConnectionManager {
  terminateConnectionsForSession: (sessionId: string) => void;
  terminateConnectionsForUserInWorkspace: (workspaceId: string, userId: string) => void;
  updateConnectionRoleForUserInWorkspace: (workspaceId: string, userId: string, newRole: WorkspaceRole) => void;
  getLiveDocument?: (documentName: string) => Promise<Y.Doc>;
}

export async function createHocuspocusServer(db: DatabaseAdapter): Promise<Hocuspocus> {
  let sessionSweepInterval: NodeJS.Timeout | null = null;
  let autoCheckpointInterval: NodeJS.Timeout | null = null;

  // Configurable auto-checkpoint interval (default: 60 seconds; overridable via env)
  const AUTO_CHECKPOINT_INTERVAL_MS = parseInt(process.env.AUTO_CHECKPOINT_INTERVAL_MS || '60000', 10);

  const server = new Hocuspocus({
    port: PORT,
    address: HOST,
    timeout: 30000,
    debounce: 1000, // Batch database store calls every 1 second
    maxDebounce: 5000,

    async onConfigure() {
      // Periodic sweep every 5 seconds to actively validate sessions & access on idle connections
      sessionSweepInterval = setInterval(async () => {
        try {
          for (const document of server.documents.values()) {
            const connections = document.getConnections();
            for (const conn of connections) {
              const ctx = conn.context as HocuspocusContext;
              if (!ctx || !ctx.sessionId || !ctx.user) continue;

              // Validate session in PostgreSQL
              const session = await validateSession(db, ctx.sessionId);
              if (!session) {
                console.log(`[Sweep] Terminating expired or revoked session connection for user ${ctx.user.email}`);
                conn.close({ code: 4403, reason: 'Session expired or revoked' });
                try {
                  conn.webSocket?.close(4403, 'Session expired or revoked');
                } catch (_err) {
                  // Socket may already be closing or closed
                }
                continue;
              }

              // Validate document/workspace access in PostgreSQL
              const access = await getDocumentAccess(db, document.name, ctx.user.id);
              if (!access.allowed || !access.role) {
                console.log(`[Sweep] Terminating connection for user ${ctx.user.email} whose access was removed`);
                conn.close({ code: 4403, reason: 'Access denied or revoked' });
                try {
                  conn.webSocket?.close(4403, 'Access denied or revoked');
                } catch (_err) {
                  // Socket may already be closing or closed
                }
                continue;
              }

              // Downgrade or upgrade connection readOnly state if role changed
              if (access.role !== ctx.role) {
                ctx.role = access.role;
                (conn as any).readOnly = (access.role === 'viewer');
              }
            }
          }

          // Sweep Board SSE clients
          for (const boardClient of boardEventManager.getClients()) {
            const session = await validateSession(db, boardClient.sessionId);
            if (!session) {
              boardEventManager.terminateForSession(boardClient.sessionId);
              continue;
            }
            const role = await getUserRoleInWorkspace(db, boardClient.workspaceId, boardClient.userId);
            if (!role) {
              boardEventManager.terminateForUserInWorkspace(boardClient.workspaceId, boardClient.userId);
              continue;
            }
            if (role !== boardClient.role) {
              boardEventManager.updateRoleForUserInWorkspace(boardClient.workspaceId, boardClient.userId, role);
            }
          }
        } catch (err) {
          console.error('[Sweep Error]:', err);
        }
      }, 5000);
      sessionSweepInterval.unref?.();

      // Periodic automatic checkpoints for changed documents (honest multi-user attribution)
      autoCheckpointInterval = setInterval(async () => {
        try {
          for (const document of server.documents.values()) {
            const ydoc = document as unknown as Y.Doc;
            if (!ydoc) continue;

            // Lookup workspace ID for document
            const wsDocRes = await db.query(
              `SELECT workspace_id FROM workspace_documents WHERE id = $1`,
              [document.name]
            );
            if (wsDocRes.rows.length === 0) continue;
            const workspaceId = wsDocRes.rows[0].workspace_id;

            // Automatically snapshot changed documents, skipping unchanged content
            await createDocumentCheckpoint(db, {
              documentId: document.name,
              workspaceId,
              kind: 'automatic',
              label: 'Automatic Checkpoint',
              doc: ydoc,
              skipIfUnchanged: true,
            });
          }
        } catch (err) {
          console.error('[Auto Checkpoint Error]:', err);
        }
      }, AUTO_CHECKPOINT_INTERVAL_MS);
      autoCheckpointInterval.unref?.();
    },

    async onDestroy() {
      if (sessionSweepInterval) {
        clearInterval(sessionSweepInterval);
        sessionSweepInterval = null;
      }
      if (autoCheckpointInterval) {
        clearInterval(autoCheckpointInterval);
        autoCheckpointInterval = null;
      }
    },

    async onRequest(data: onRequestPayload) {
      const { request, response } = data;
      // Handle HTTP API endpoints under /api with connection manager callbacks
      const handled = await handleHttpApi(request, response, db, {
        terminateConnectionsForSession: (sessionId: string) => {
          boardEventManager.terminateForSession(sessionId);
          for (const document of server.documents.values()) {
            const connections = document.getConnections();
            for (const conn of connections) {
              const ctx = conn.context as HocuspocusContext;
              if (ctx && ctx.sessionId === sessionId) {
                console.log(`[Auth Revoke] Closing active connection for logged-out session ${sessionId}`);
                conn.close({ code: 4403, reason: 'Session revoked' });
                try {
                  conn.webSocket?.close(4403, 'Session revoked');
                } catch (_err) {
                  // Socket may already be closing or closed
                }
              }
            }
          }
        },
        terminateConnectionsForUserInWorkspace: (workspaceId: string, userId: string) => {
          boardEventManager.terminateForUserInWorkspace(workspaceId, userId);
          for (const document of server.documents.values()) {
            const connections = document.getConnections();
            for (const conn of connections) {
              const ctx = conn.context as HocuspocusContext;
              if (ctx && ctx.user?.id === userId && ctx.workspaceId === workspaceId) {
                console.log(`[Access Revoke] Closing active connection for removed user ${userId} in workspace ${workspaceId}`);
                conn.close({ code: 4403, reason: 'Access revoked to this workspace' });
                try {
                  conn.webSocket?.close(4403, 'Access revoked to this workspace');
                } catch (_err) {
                  // Socket may already be closing or closed
                }
              }
            }
          }
        },
        updateConnectionRoleForUserInWorkspace: (workspaceId: string, userId: string, newRole: WorkspaceRole) => {
          boardEventManager.updateRoleForUserInWorkspace(workspaceId, userId, newRole);
          for (const document of server.documents.values()) {
            const connections = document.getConnections();
            for (const conn of connections) {
              const ctx = conn.context as HocuspocusContext;
              if (ctx && ctx.user?.id === userId && ctx.workspaceId === workspaceId) {
                console.log(`[Role Update] Updating connection role for user ${userId} in workspace ${workspaceId} to ${newRole}`);
                ctx.role = newRole;
                (conn as any).readOnly = (newRole === 'viewer');
              }
            }
          }
        },
        getLiveDocument: async (documentName: string) => {
          // If document is already open in memory, return its authoritative live Y.Doc directly
          const inMemoryDoc = server.documents.get(documentName);
          if (inMemoryDoc) {
            return inMemoryDoc as unknown as Y.Doc;
          }
          // Otherwise load it from PostgreSQL
          const result = await db.query(
            'SELECT data FROM documents WHERE id = $1',
            [documentName]
          );
          const doc = new Y.Doc();
          if (result.rows.length > 0 && result.rows[0].data) {
            Y.applyUpdate(doc, new Uint8Array(result.rows[0].data));
          }
          return doc;
        },
      });
      if (handled) {
        // Hocuspocus convention: reject with empty error to prevent default responseHandler from running
        throw undefined;
      }
    },

    async onAuthenticate(data: onAuthenticatePayload) {
      const { documentName, requestHeaders, requestParameters, connection, token } = data;

      // Extract session ID from data.token, cookie header, or query parameter
      let sessionId: string | null = token || null;
      if (!sessionId && requestHeaders.cookie) {
        const dummyReq = { headers: { cookie: requestHeaders.cookie } } as any;
        const cookies = parseCookies(dummyReq);
        sessionId = cookies['syncraft_session'] || null;
      }

      if (!sessionId && requestParameters.has('token')) {
        sessionId = requestParameters.get('token');
      }

      if (!sessionId) {
        console.warn(`[Hocuspocus Auth] Unauthenticated connection rejected for document "${documentName}"`);
        throw new Error('Authentication required');
      }

      const authContext = await validateSession(db, sessionId);
      if (!authContext) {
        console.warn(`[Hocuspocus Auth] Invalid or expired session for document "${documentName}"`);
        throw new Error('Invalid or expired session');
      }

      // Check workspace membership and permissions for the document
      const access = await getDocumentAccess(db, documentName, authContext.user.id);
      if (!access.allowed || !access.role || !access.workspaceId) {
        console.warn(
          `[Hocuspocus Auth] Access denied: User ${authContext.user.email} (${authContext.user.id}) not a member or unauthorized for document "${documentName}"`
        );
        throw new Error('Access denied to this document');
      }

      // If user is a viewer, set connection to readOnly
      if (access.role === 'viewer') {
        connection.readOnly = true;
      }

      return {
        user: authContext.user,
        sessionId: authContext.sessionId,
        role: access.role,
        workspaceId: access.workspaceId,
      } as HocuspocusContext;
    },

    async onConnect(data: onConnectPayload) {
      const { documentName, context } = data;
      const ctx = context as HocuspocusContext;
      console.log(`[Hocuspocus] Client connected to document "${documentName}" as user: ${ctx?.user?.name} (${ctx?.role})`);
    },

    async beforeHandleMessage(data: beforeHandleMessagePayload) {
      const { context, documentName } = data;
      const ctx = context as HocuspocusContext;

      if (!ctx || !ctx.user) {
        throw new Error('Unauthenticated client attempted to send message');
      }

      // Re-verify authorization and session validity on message processing
      const currentAuth = await validateSession(db, ctx.sessionId);
      if (!currentAuth) {
        console.warn(`[Hocuspocus] Session revoked mid-session for user ${ctx.user.email}`);
        throw new Error('Session revoked');
      }

      const access = await getDocumentAccess(db, documentName, ctx.user.id);
      if (!access.allowed || !access.role) {
        console.warn(`[Hocuspocus] Membership revoked mid-session for user ${ctx.user.email}`);
        throw new Error('Access revoked to this document');
      }

      // Update current role in context in case it changed
      ctx.role = access.role;

      // Viewer restriction: Viewers cannot send update messages (prevent modifying CRDT)
      // Note: Hocuspocus connection.readOnly prevents sync step 2/updates, but we enforce it strictly
      if (ctx.role === 'viewer') {
        // Enforce readOnly on connection
        if (data.connection) {
          (data.connection as any).readOnly = true;
        }
      }
    },

    async onLoadDocument(data: onLoadDocumentPayload) {
      const { documentName } = data;
      console.log(`[Hocuspocus] Loading document "${documentName}" from PostgreSQL...`);

      try {
        const result = await db.query(
          'SELECT data FROM documents WHERE id = $1',
          [documentName]
        );

        if (result.rows.length > 0 && result.rows[0].data) {
          const doc = new Y.Doc();
          const buffer = result.rows[0].data;
          // Apply binary update to Y.Doc
          const uint8Array = new Uint8Array(buffer);
          Y.applyUpdate(doc, uint8Array);
          console.log(`[Hocuspocus] Document "${documentName}" loaded (${uint8Array.byteLength} bytes)`);
          return doc;
        }

        console.log(`[Hocuspocus] Document "${documentName}" is brand new. Returning empty doc.`);
        return new Y.Doc();
      } catch (err) {
        console.error(`[Hocuspocus] Error loading document "${documentName}":`, err);
        throw err;
      }
    },

    async onStoreDocument(data: onStoreDocumentPayload) {
      const { documentName, document, context } = data;
      const ctx = context as HocuspocusContext;

      // Ensure that if a store is triggered, the user context isn't a viewer
      if (ctx && ctx.role === 'viewer') {
        console.warn(`[Hocuspocus] Ignored store request for viewer user ${ctx?.user?.email}`);
        return;
      }

      const update = Y.encodeStateAsUpdate(document);
      const buffer = Buffer.from(update);

      console.log(
        `[Hocuspocus] Storing document "${documentName}" to PostgreSQL (${buffer.length} bytes)...`
      );

      try {
        await db.query(
          `INSERT INTO documents (id, data, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (id)
           DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP`,
          [documentName, buffer]
        );
        console.log(`[Hocuspocus] Document "${documentName}" persisted successfully.`);
      } catch (err) {
        console.error(`[Hocuspocus] Error storing document "${documentName}":`, err);
      }
    },

    async onDisconnect(data: onDisconnectPayload) {
      const { documentName, context } = data;
      const ctx = context as HocuspocusContext;
      console.log(`[Hocuspocus] Client disconnected from document "${documentName}" (${ctx?.user?.name || 'unknown'})`);
    },
  });

  return server;
}

export async function start() {
  const db = await initDatabase();
  // Run database migrations on startup
  await runMigrations(db);
  const server = await createHocuspocusServer(db);

  await server.listen();
  console.log(`Syncraft Collaboration Server listening on ws://${HOST}:${PORT}`);
  return { server, db };
}

// Only start directly if executed as main module
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  start().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}
