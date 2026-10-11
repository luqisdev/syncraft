import http from 'http';
import { parseCookie, stringifySetCookie } from 'cookie';
import { DatabaseAdapter } from './db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  revokeSession,
  validateSession,
  checkAuthRateLimit,
  generateId,
  AuthContext,
} from './auth.js';
import {
  getUserRoleInWorkspace,
} from './workspaces.js';
import {
  createBoard,
  getBoardDetails,
  renameBoard,
  createColumn,
  renameColumn,
  reorderColumn,
  deleteColumn,
  createTask,
  updateTask,
  moveTask,
  archiveTask,
  restoreTask,
} from './boards.js';
import { boardEventManager } from './board-events.js';
import {
  createDocumentCheckpoint,
  listDocumentCheckpoints,
  listDocumentRestorations,
  getCheckpointDetail,
  restoreDocumentCheckpoint,
  computeContentHash,
  extractPlainTextFromDoc,
} from './document-history.js';

export function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const parsed = parseCookie(header);
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}

export function sendJson(res: http.ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': reqOrigin(res) || 'http://127.0.0.1:5173',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

let lastReqOrigin: string = '';
function reqOrigin(_res: http.ServerResponse): string {
  return lastReqOrigin;
}

export async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

export async function authenticateRequest(
  req: http.IncomingMessage,
  db: DatabaseAdapter
): Promise<AuthContext | null> {
  const cookies = parseCookies(req);
  const sessionId = cookies['syncraft_session'] || (req.headers['x-session-id'] as string);
  if (!sessionId) return null;
  return validateSession(db, sessionId);
}

export interface ConnectionManagerCallbacks {
  terminateConnectionsForSession?: (sessionId: string) => void;
  terminateConnectionsForUserInWorkspace?: (workspaceId: string, userId: string) => void;
  updateConnectionRoleForUserInWorkspace?: (workspaceId: string, userId: string, newRole: any) => void;
  getLiveDocument?: (documentName: string) => Promise<any>;
}

export async function handleHttpApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: DatabaseAdapter,
  connectionManager?: ConnectionManagerCallbacks
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;
  lastReqOrigin = (req.headers.origin as string) || '';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': lastReqOrigin || 'http://127.0.0.1:5173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    });
    res.end();
    return true;
  }

  if (!pathname.startsWith('/api/')) {
    return false; // Delegate to other handlers / Hocuspocus
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    // --- AUTH ROUTES ---
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      if (!checkAuthRateLimit(clientIp)) {
        sendJson(res, 429, { error: 'Too many registration attempts. Please try again later.' });
        return true;
      }
      const body = await readJsonBody(req);
      const { name, email, password } = body;
      if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
        sendJson(res, 400, { error: 'Name, valid email, and password of at least 6 characters required.' });
        return true;
      }

      const normalizedEmail = email.trim().toLowerCase();
      // Check if email already exists
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (existing.rows.length > 0) {
        sendJson(res, 409, { error: 'A user with this email address already exists.' });
        return true;
      }

      const userId = generateId();
      const passwordHash = await hashPassword(password);
      await db.query(
        'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
        [userId, name.trim(), normalizedEmail, passwordHash]
      );

      // Auto-create initial default workspace for the user
      const workspaceId = generateId();
      await db.query('INSERT INTO workspaces (id, name, created_by) VALUES ($1, $2, $3)', [
        workspaceId,
        `${name.trim()}'s Workspace`,
        userId,
      ]);
      await db.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [
        workspaceId,
        userId,
        'owner',
      ]);
      // Create initial welcome document
      const initialDocId = generateId();
      await db.query(
        'INSERT INTO workspace_documents (id, workspace_id, title, created_by) VALUES ($1, $2, $3, $4)',
        [initialDocId, workspaceId, 'Getting Started', userId]
      );

      const sessionId = await createSession(db, userId);
      const isSecure = process.env.NODE_ENV === 'production';
      const cookieHeader = stringifySetCookie({
        name: 'syncraft_session',
        value: sessionId,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecure,
        maxAge: 7 * 24 * 60 * 60,
      });

      sendJson(res, 201, {
        user: { id: userId, name: name.trim(), email: normalizedEmail },
        workspaceId,
        sessionId,
      }, { 'Set-Cookie': cookieHeader });
      return true;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (!checkAuthRateLimit(clientIp)) {
        sendJson(res, 429, { error: 'Too many login attempts. Please try again later.' });
        return true;
      }
      const body = await readJsonBody(req);
      const { email, password } = body;
      if (!email || !password) {
        sendJson(res, 400, { error: 'Email and password required.' });
        return true;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const userRes = await db.query(
        'SELECT id, name, email, password_hash FROM users WHERE email = $1',
        [normalizedEmail]
      );

      if (userRes.rows.length === 0) {
        sendJson(res, 401, { error: 'Invalid email or password.' });
        return true;
      }

      const userRow = userRes.rows[0];
      const valid = await verifyPassword(password, userRow.password_hash);
      if (!valid) {
        sendJson(res, 401, { error: 'Invalid email or password.' });
        return true;
      }

      const sessionId = await createSession(db, userRow.id);
      const isSecure = process.env.NODE_ENV === 'production';
      const cookieHeader = stringifySetCookie({
        name: 'syncraft_session',
        value: sessionId,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecure,
        maxAge: 7 * 24 * 60 * 60,
      });

      sendJson(res, 200, {
        user: { id: userRow.id, name: userRow.name, email: userRow.email },
        sessionId,
      }, { 'Set-Cookie': cookieHeader });
      return true;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const sessionId = cookies['syncraft_session'];
      if (sessionId) {
        await revokeSession(db, sessionId);
        connectionManager?.terminateConnectionsForSession?.(sessionId);
      }
      const cookieHeader = stringifySetCookie({
        name: 'syncraft_session',
        value: '',
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: new Date(0),
      });
      sendJson(res, 200, { success: true }, { 'Set-Cookie': cookieHeader });
      return true;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = await authenticateRequest(req, db);
      if (!auth) {
        sendJson(res, 401, { error: 'Not authenticated' });
        return true;
      }
      sendJson(res, 200, { user: auth.user, sessionId: auth.sessionId });
      return true;
    }

    // --- PROTECTED WORKSPACE & DOCUMENT ROUTES ---
    const auth = await authenticateRequest(req, db);
    if (!auth) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    // List workspaces user belongs to
    if (pathname === '/api/workspaces' && req.method === 'GET') {
      const resWorkspaces = await db.query(
        `SELECT w.id, w.name, w.created_by, w.created_at, wm.role
         FROM workspaces w
         JOIN workspace_members wm ON w.id = wm.workspace_id
         WHERE wm.user_id = $1
         ORDER BY w.created_at ASC`,
        [auth.user.id]
      );
      sendJson(res, 200, { workspaces: resWorkspaces.rows });
      return true;
    }

    // Create workspace
    if (pathname === '/api/workspaces' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { name } = body;
      if (!name?.trim()) {
        sendJson(res, 400, { error: 'Workspace name is required.' });
        return true;
      }

      const workspaceId = generateId();
      await db.query('INSERT INTO workspaces (id, name, created_by) VALUES ($1, $2, $3)', [
        workspaceId,
        name.trim(),
        auth.user.id,
      ]);
      await db.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
        [workspaceId, auth.user.id, 'owner']
      );

      // Create an initial document
      const docId = generateId();
      await db.query(
        'INSERT INTO workspace_documents (id, workspace_id, title, created_by) VALUES ($1, $2, $3, $4)',
        [docId, workspaceId, 'Untitled Document', auth.user.id]
      );

      sendJson(res, 201, {
        workspace: { id: workspaceId, name: name.trim(), created_by: auth.user.id, role: 'owner' },
        initialDocId: docId,
      });
      return true;
    }

    // Workspace Member Management: GET /api/workspaces/:id/members
    const membersMatch = pathname.match(/^\/api\/workspaces\/([a-zA-Z0-9_-]+)\/members$/);
    if (membersMatch && req.method === 'GET') {
      const workspaceId = membersMatch[1];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role) {
        sendJson(res, 403, { error: 'Not a member of this workspace.' });
        return true;
      }

      const membersRes = await db.query(
        `SELECT wm.workspace_id, wm.user_id, wm.role, wm.joined_at, u.name, u.email
         FROM workspace_members wm
         JOIN users u ON wm.user_id = u.id
         WHERE wm.workspace_id = $1
         ORDER BY wm.joined_at ASC`,
        [workspaceId]
      );
      sendJson(res, 200, { members: membersRes.rows });
      return true;
    }

    // Add Member by exact email (owner only)
    if (membersMatch && req.method === 'POST') {
      const workspaceId = membersMatch[1];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (role !== 'owner') {
        sendJson(res, 403, { error: 'Only workspace owners can add members.' });
        return true;
      }

      const body = await readJsonBody(req);
      const { email, role: newRole = 'editor' } = body;
      if (!email?.trim() || !['editor', 'viewer'].includes(newRole)) {
        sendJson(res, 400, { error: 'Valid user email and role (editor or viewer) required.' });
        return true;
      }

      const targetUser = await db.query('SELECT id, name, email FROM users WHERE email = $1', [
        email.trim().toLowerCase(),
      ]);
      if (targetUser.rows.length === 0) {
        sendJson(res, 404, { error: 'No registered user found with that exact email.' });
        return true;
      }

      const target = targetUser.rows[0];
      await db.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3`,
        [workspaceId, target.id, newRole]
      );

      sendJson(res, 201, { member: { user_id: target.id, name: target.name, email: target.email, role: newRole } });
      return true;
    }

    // Update / Remove member (owner only, last owner protection)
    const singleMemberMatch = pathname.match(/^\/api\/workspaces\/([a-zA-Z0-9_-]+)\/members\/([a-zA-Z0-9_-]+)$/);
    if (singleMemberMatch) {
      const workspaceId = singleMemberMatch[1];
      const targetUserId = singleMemberMatch[2];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);

      if (role !== 'owner') {
        sendJson(res, 403, { error: 'Only workspace owners can manage members.' });
        return true;
      }

      if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        const { role: newRole } = body;
        if (!['owner', 'editor', 'viewer'].includes(newRole)) {
          sendJson(res, 400, { error: 'Invalid role.' });
          return true;
        }

        // Last owner check
        if (newRole !== 'owner') {
          const ownersCount = await db.query(
            `SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'`,
            [workspaceId]
          );
          const currentTargetRole = await getUserRoleInWorkspace(db, workspaceId, targetUserId);
          if (currentTargetRole === 'owner' && parseInt(ownersCount.rows[0].count, 10) <= 1) {
            sendJson(res, 400, { error: 'Cannot demote the last owner of the workspace.' });
            return true;
          }
        }

        await db.query(
          `UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
          [newRole, workspaceId, targetUserId]
        );
        connectionManager?.updateConnectionRoleForUserInWorkspace?.(workspaceId, targetUserId, newRole);
        boardEventManager.updateRoleForUserInWorkspace(workspaceId, targetUserId, newRole);
        sendJson(res, 200, { success: true, role: newRole });
        return true;
      }

      if (req.method === 'DELETE') {
        // Last owner check
        const currentTargetRole = await getUserRoleInWorkspace(db, workspaceId, targetUserId);
        if (currentTargetRole === 'owner') {
          const ownersCount = await db.query(
            `SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'`,
            [workspaceId]
          );
          if (parseInt(ownersCount.rows[0].count, 10) <= 1) {
            sendJson(res, 400, { error: 'Cannot remove the last owner of the workspace.' });
            return true;
          }
        }

        await db.query(
          `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
          [workspaceId, targetUserId]
        );
        connectionManager?.terminateConnectionsForUserInWorkspace?.(workspaceId, targetUserId);
        boardEventManager.terminateForUserInWorkspace(workspaceId, targetUserId);
        sendJson(res, 200, { success: true });
        return true;
      }
    }

    // List Documents: GET /api/workspaces/:id/documents
    const docsMatch = pathname.match(/^\/api\/workspaces\/([a-zA-Z0-9_-]+)\/documents$/);
    if (docsMatch && req.method === 'GET') {
      const workspaceId = docsMatch[1];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role) {
        sendJson(res, 403, { error: 'Access denied to this workspace.' });
        return true;
      }

      const docsRes = await db.query(
        `SELECT id, workspace_id, title, created_by, created_at, updated_at
         FROM workspace_documents
         WHERE workspace_id = $1
         ORDER BY updated_at DESC`,
        [workspaceId]
      );
      sendJson(res, 200, { documents: docsRes.rows, userRole: role });
      return true;
    }

    // Create Document: POST /api/workspaces/:id/documents (owner or editor)
    if (docsMatch && req.method === 'POST') {
      const workspaceId = docsMatch[1];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers are not permitted to create documents.' });
        return true;
      }

      const body = await readJsonBody(req);
      const title = (body.title || 'Untitled Document').trim();
      const docId = generateId();

      await db.query(
        `INSERT INTO workspace_documents (id, workspace_id, title, created_by)
         VALUES ($1, $2, $3, $4)`,
        [docId, workspaceId, title, auth.user.id]
      );

      sendJson(res, 201, {
        document: { id: docId, workspace_id: workspaceId, title, created_by: auth.user.id },
      });
      return true;
    }

    // Rename Document: PATCH /api/workspaces/:id/documents/:docId (owner or editor)
    const singleDocMatch = pathname.match(/^\/api\/workspaces\/([a-zA-Z0-9_-]+)\/documents\/([a-zA-Z0-9_-]+)$/);
    if (singleDocMatch && req.method === 'PATCH') {
      const workspaceId = singleDocMatch[1];
      const docId = singleDocMatch[2];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot rename documents.' });
        return true;
      }

      const body = await readJsonBody(req);
      const title = body.title?.trim();
      if (!title) {
        sendJson(res, 400, { error: 'Title cannot be empty.' });
        return true;
      }

      await db.query(
        `UPDATE workspace_documents SET title = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND workspace_id = $3`,
        [title, docId, workspaceId]
      );

      sendJson(res, 200, { success: true, title });
      return true;
    }

    // --- BOARD ROUTES ---

    // List Boards: GET /api/workspaces/:id/boards
    const boardsMatch = pathname.match(/^\/api\/workspaces\/([a-zA-Z0-9_-]+)\/boards$/);
    if (boardsMatch && req.method === 'GET') {
      const workspaceId = boardsMatch[1];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role) {
        sendJson(res, 403, { error: 'Access denied to this workspace.' });
        return true;
      }

      const boardsRes = await db.query(
        `SELECT id, workspace_id, title, created_by, created_at, updated_at
         FROM project_boards
         WHERE workspace_id = $1
         ORDER BY updated_at DESC`,
        [workspaceId]
      );
      sendJson(res, 200, { boards: boardsRes.rows, userRole: role });
      return true;
    }

    // Create Board: POST /api/workspaces/:id/boards (owner or editor)
    if (boardsMatch && req.method === 'POST') {
      const workspaceId = boardsMatch[1];
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot create boards.' });
        return true;
      }

      const body = await readJsonBody(req);
      const title = (body.title || 'Untitled Board').trim();
      const result = await createBoard(db, workspaceId, title, auth.user.id);
      sendJson(res, 201, result);
      return true;
    }

    // Board Details & SSE
    const boardDetailMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)$/);
    if (boardDetailMatch && req.method === 'GET') {
      const boardId = boardDetailMatch[1];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const workspaceId = boardCheck.rows[0].workspace_id;
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role) {
        sendJson(res, 403, { error: 'Access denied to this workspace board.' });
        return true;
      }

      const details = await getBoardDetails(db, boardId);
      sendJson(res, 200, { ...details, userRole: role });
      return true;
    }

    // Rename Board: PATCH /api/boards/:id (owner or editor)
    if (boardDetailMatch && req.method === 'PATCH') {
      const boardId = boardDetailMatch[1];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const workspaceId = boardCheck.rows[0].workspace_id;
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot rename boards.' });
        return true;
      }

      const body = await readJsonBody(req);
      const title = body.title?.trim();
      if (!title) {
        sendJson(res, 400, { error: 'Board title cannot be empty.' });
        return true;
      }

      const updated = await renameBoard(db, boardId, title);
      sendJson(res, 200, { board: updated });
      return true;
    }

    // Board Events SSE: GET /api/boards/:id/events
    const boardEventsMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/events$/);
    if (boardEventsMatch && req.method === 'GET') {
      const boardId = boardEventsMatch[1];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const workspaceId = boardCheck.rows[0].workspace_id;
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role) {
        sendJson(res, 403, { error: 'Access denied to this workspace board.' });
        return true;
      }

      // Initialize SSE stream
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': reqOrigin(res) || 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true',
      });
      res.write(': connected\n\n');

      const clientId = generateId();
      boardEventManager.addClient({
        id: clientId,
        boardId,
        workspaceId,
        userId: auth.user.id,
        sessionId: auth.sessionId,
        role,
        res,
      });

      return true;
    }

    // Columns: POST /api/boards/:id/columns (owner or editor)
    const boardColsMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/columns$/);
    if (boardColsMatch && req.method === 'POST') {
      const boardId = boardColsMatch[1];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const role = await getUserRoleInWorkspace(db, boardCheck.rows[0].workspace_id, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot create columns.' });
        return true;
      }

      const body = await readJsonBody(req);
      const title = body.title?.trim();
      if (!title) {
        sendJson(res, 400, { error: 'Column title cannot be empty.' });
        return true;
      }

      const column = await createColumn(db, boardId, title);
      sendJson(res, 201, { column });
      return true;
    }

    // Column by ID: PATCH /api/boards/:id/columns/:colId (rename or reorder)
    const singleColMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/columns\/([a-zA-Z0-9_-]+)$/);
    if (singleColMatch && req.method === 'PATCH') {
      const boardId = singleColMatch[1];
      const columnId = singleColMatch[2];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const role = await getUserRoleInWorkspace(db, boardCheck.rows[0].workspace_id, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot modify columns.' });
        return true;
      }

      const body = await readJsonBody(req);
      if (body.title !== undefined) {
        const title = body.title?.trim();
        if (!title) {
          sendJson(res, 400, { error: 'Column title cannot be empty.' });
          return true;
        }
        const column = await renameColumn(db, boardId, columnId, title);
        sendJson(res, 200, { column });
        return true;
      }

      if (body.position !== undefined) {
        const columns = await reorderColumn(db, boardId, columnId, body.position);
        sendJson(res, 200, { columns });
        return true;
      }

      sendJson(res, 400, { error: 'No valid column fields to update.' });
      return true;
    }

    // Delete Column: DELETE /api/boards/:id/columns/:colId (must be empty)
    if (singleColMatch && req.method === 'DELETE') {
      const boardId = singleColMatch[1];
      const columnId = singleColMatch[2];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const role = await getUserRoleInWorkspace(db, boardCheck.rows[0].workspace_id, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot delete columns.' });
        return true;
      }

      try {
        await deleteColumn(db, boardId, columnId);
        sendJson(res, 200, { success: true, columnId });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // Tasks: POST /api/boards/:id/tasks (create task with idempotency key)
    const boardTasksMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/tasks$/);
    if (boardTasksMatch && req.method === 'POST') {
      const boardId = boardTasksMatch[1];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const workspaceId = boardCheck.rows[0].workspace_id;
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot create tasks.' });
        return true;
      }

      const body = await readJsonBody(req);
      const idempotencyKey = (req.headers['x-idempotency-key'] as string) || body.idempotency_key || body.clientRequestId;
      const title = body.title?.trim();
      const columnId = body.columnId || body.column_id;

      if (!title) {
        sendJson(res, 400, { error: 'Task title cannot be empty.' });
        return true;
      }
      if (!columnId) {
        sendJson(res, 400, { error: 'Target column ID is required.' });
        return true;
      }

      try {
        const result = await createTask(
          db,
          boardId,
          workspaceId,
          columnId,
          {
            title,
            description: body.description,
            priority: body.priority,
            due_date: body.dueDate || body.due_date,
            assignee_id: body.assigneeId || body.assignee_id,
          },
          auth.user.id,
          idempotencyKey
        );
        sendJson(res, result.created ? 201 : 200, { task: result.task });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // Single Task: PATCH /api/boards/:id/tasks/:taskId (optimistic concurrency version check)
    const singleTaskMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)$/);
    if (singleTaskMatch && req.method === 'PATCH') {
      const boardId = singleTaskMatch[1];
      const taskId = singleTaskMatch[2];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const workspaceId = boardCheck.rows[0].workspace_id;
      const role = await getUserRoleInWorkspace(db, workspaceId, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot modify tasks.' });
        return true;
      }

      const body = await readJsonBody(req);
      const expectedVersion = typeof body.version === 'number' ? body.version : null;
      if (expectedVersion === null) {
        sendJson(res, 400, { error: 'Task version is required for concurrency control.' });
        return true;
      }

      try {
        const result = await updateTask(db, boardId, workspaceId, taskId, expectedVersion, {
          title: body.title,
          description: body.description,
          priority: body.priority,
          due_date: body.dueDate !== undefined ? body.dueDate : body.due_date,
          assignee_id: body.assigneeId !== undefined ? body.assigneeId : body.assignee_id,
        });

        if (result.conflict) {
          sendJson(res, 409, {
            error: 'Conflict: This task was modified by another user.',
            currentTask: result.currentTask,
          });
          return true;
        }

        sendJson(res, 200, { task: result.task });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // Move Task: POST /api/boards/:id/tasks/:taskId/move
    const moveTaskMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)\/move$/);
    if (moveTaskMatch && req.method === 'POST') {
      const boardId = moveTaskMatch[1];
      const taskId = moveTaskMatch[2];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const role = await getUserRoleInWorkspace(db, boardCheck.rows[0].workspace_id, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot move tasks.' });
        return true;
      }

      const body = await readJsonBody(req);
      const { targetColumnId, targetPosition } = body;
      if (!targetColumnId || typeof targetPosition !== 'number') {
        sendJson(res, 400, { error: 'targetColumnId and numeric targetPosition are required.' });
        return true;
      }

      try {
        const result = await moveTask(db, boardId, taskId, targetColumnId, targetPosition);
        sendJson(res, 200, result);
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // Archive Task: POST /api/boards/:id/tasks/:taskId/archive
    const archiveTaskMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)\/archive$/);
    if (archiveTaskMatch && req.method === 'POST') {
      const boardId = archiveTaskMatch[1];
      const taskId = archiveTaskMatch[2];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const role = await getUserRoleInWorkspace(db, boardCheck.rows[0].workspace_id, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot archive tasks.' });
        return true;
      }

      try {
        const task = await archiveTask(db, boardId, taskId);
        sendJson(res, 200, { task });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // Restore Task: POST /api/boards/:id/tasks/:taskId/restore
    const restoreTaskMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)\/restore$/);
    if (restoreTaskMatch && req.method === 'POST') {
      const boardId = restoreTaskMatch[1];
      const taskId = restoreTaskMatch[2];
      const boardCheck = await db.query(`SELECT workspace_id FROM project_boards WHERE id = $1`, [boardId]);
      if (boardCheck.rows.length === 0) {
        sendJson(res, 404, { error: 'Board not found' });
        return true;
      }
      const role = await getUserRoleInWorkspace(db, boardCheck.rows[0].workspace_id, auth.user.id);
      if (!role || role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot restore tasks.' });
        return true;
      }

      const body = await readJsonBody(req);
      try {
        const task = await restoreTask(db, boardId, taskId, body.targetColumnId);
        sendJson(res, 200, { task });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // ==========================================
    // MILESTONE 4: DOCUMENT VERSION HISTORY APIS
    // ==========================================

    // Helper to get workspace and role for a document
    async function getDocWorkspaceAndRole(docId: string, userId: string) {
      const wsDocRes = await db.query(
        `SELECT workspace_id FROM workspace_documents WHERE id = $1`,
        [docId]
      );
      if (wsDocRes.rows.length === 0) return null;
      const workspaceId = wsDocRes.rows[0].workspace_id;
      const role = await getUserRoleInWorkspace(db, workspaceId, userId);
      if (!role) return null;
      return { workspaceId, role };
    }

    // 1. Get Live Document State / Hash for Comparison & Concurrency Guard: GET /api/documents/:id/current-state
    const docCurrentStateMatch = pathname.match(/^\/api\/documents\/([a-zA-Z0-9_-]+)\/current-state$/);
    if (docCurrentStateMatch && req.method === 'GET') {
      const docId = docCurrentStateMatch[1];
      const perm = await getDocWorkspaceAndRole(docId, auth.user.id);
      if (!perm) {
        sendJson(res, 403, { error: 'Access denied or document not found' });
        return true;
      }

      if (!connectionManager || !connectionManager.getLiveDocument) {
        sendJson(res, 500, { error: 'Live document resolver not available' });
        return true;
      }

      const liveDoc = await connectionManager.getLiveDocument(docId);
      const contentHash = computeContentHash(liveDoc);
      const plainText = extractPlainTextFromDoc(liveDoc);

      sendJson(res, 200, {
        document_id: docId,
        content_hash: contentHash,
        plain_text: plainText,
      });
      return true;
    }

    // 2. List Document Checkpoints: GET /api/documents/:id/checkpoints
    // 3. Create Manual Document Checkpoint: POST /api/documents/:id/checkpoints
    const docCheckpointsMatch = pathname.match(/^\/api\/documents\/([a-zA-Z0-9_-]+)\/checkpoints$/);
    if (docCheckpointsMatch) {
      const docId = docCheckpointsMatch[1];
      const perm = await getDocWorkspaceAndRole(docId, auth.user.id);
      if (!perm) {
        sendJson(res, 403, { error: 'Access denied or document not found' });
        return true;
      }

      if (req.method === 'GET') {
        const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
        const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);

        const result = await listDocumentCheckpoints(db, docId, limit, offset);
        sendJson(res, 200, result);
        return true;
      }

      if (req.method === 'POST') {
        if (perm.role === 'viewer') {
          sendJson(res, 403, { error: 'Viewers cannot create document versions.' });
          return true;
        }

        const body = await readJsonBody(req);
        if (!connectionManager || !connectionManager.getLiveDocument) {
          sendJson(res, 500, { error: 'Live document resolver not available' });
          return true;
        }

        const liveDoc = await connectionManager.getLiveDocument(docId);
        const checkpoint = await createDocumentCheckpoint(db, {
          documentId: docId,
          workspaceId: perm.workspaceId,
          kind: 'manual',
          label: body.label?.trim() || null,
          createdBy: auth.user.id,
          doc: liveDoc,
          skipIfUnchanged: false,
        });

        sendJson(res, 201, { checkpoint });
        return true;
      }
    }

    // 3.5. List Completed Restorations: GET /api/documents/:id/restorations
    const docRestorationsMatch = pathname.match(/^\/api\/documents\/([a-zA-Z0-9_-]+)\/restorations$/);
    if (docRestorationsMatch && req.method === 'GET') {
      const docId = docRestorationsMatch[1];
      const perm = await getDocWorkspaceAndRole(docId, auth.user.id);
      if (!perm) {
        sendJson(res, 403, { error: 'Access denied or document not found' });
        return true;
      }

      const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const limit = parseInt(urlObj.searchParams.get('limit') || '10', 10);
      const restorations = await listDocumentRestorations(db, docId, limit);
      const latestRevision = restorations.length > 0 ? (restorations[0].revision || 0) : 0;
      sendJson(res, 200, { restorations, latestRevision });
      return true;
    }

    // 4. Get Checkpoint Detail / Preview: GET /api/documents/:id/checkpoints/:checkpointId
    const docSingleCheckpointMatch = pathname.match(/^\/api\/documents\/([a-zA-Z0-9_-]+)\/checkpoints\/([a-zA-Z0-9_-]+)$/);
    if (docSingleCheckpointMatch && req.method === 'GET') {
      const docId = docSingleCheckpointMatch[1];
      const checkpointId = docSingleCheckpointMatch[2];

      const perm = await getDocWorkspaceAndRole(docId, auth.user.id);
      if (!perm) {
        sendJson(res, 403, { error: 'Access denied or document not found' });
        return true;
      }

      const checkpoint = await getCheckpointDetail(db, checkpointId);
      if (!checkpoint || checkpoint.document_id !== docId) {
        sendJson(res, 404, { error: 'Checkpoint not found' });
        return true;
      }

      sendJson(res, 200, {
        checkpoint: {
          id: checkpoint.id,
          document_id: checkpoint.document_id,
          workspace_id: checkpoint.workspace_id,
          kind: checkpoint.kind,
          label: checkpoint.label,
          created_by: checkpoint.created_by,
          creator_name: checkpoint.creator_name,
          creator_email: checkpoint.creator_email,
          content_hash: checkpoint.content_hash,
          summary_text: checkpoint.summary_text,
          created_at: checkpoint.created_at,
          snapshot_base64: checkpoint.snapshot_data.toString('base64'),
        },
      });
      return true;
    }

    // 5. Restore Document Version: POST /api/documents/:id/restore
    const docRestoreMatch = pathname.match(/^\/api\/documents\/([a-zA-Z0-9_-]+)\/restore$/);
    if (docRestoreMatch && req.method === 'POST') {
      const docId = docRestoreMatch[1];
      const perm = await getDocWorkspaceAndRole(docId, auth.user.id);
      if (!perm) {
        sendJson(res, 403, { error: 'Access denied or document not found' });
        return true;
      }

      if (perm.role === 'viewer') {
        sendJson(res, 403, { error: 'Viewers cannot restore document versions.' });
        return true;
      }

      const body = await readJsonBody(req);
      const checkpointId = body.checkpoint_id || body.checkpointId;
      const expectedBaseHash = body.expected_base_hash || body.expectedBaseHash;
      const idempotencyKey = body.idempotency_key || body.idempotencyKey || null;

      if (!checkpointId) {
        sendJson(res, 400, { error: 'checkpoint_id is required' });
        return true;
      }

      if (!connectionManager || !connectionManager.getLiveDocument) {
        sendJson(res, 500, { error: 'Live document resolver not available' });
        return true;
      }

      const liveDoc = await connectionManager.getLiveDocument(docId);

      try {
        const result = await restoreDocumentCheckpoint(db, {
          documentId: docId,
          workspaceId: perm.workspaceId,
          checkpointId,
          userId: auth.user.id,
          expectedBaseHash,
          liveDoc,
          idempotencyKey,
        });

        sendJson(res, 200, result);
      } catch (err: any) {
        if (err.message === 'DOCUMENT_MODIFIED_CONFLICT') {
          sendJson(res, 409, {
            error: 'The live document was modified since you reviewed this version. Please review the current content before restoring.',
          });
        } else {
          sendJson(res, 400, { error: err.message });
        }
      }
      return true;
    }

    sendJson(res, 404, { error: 'Endpoint not found' });
    return true;
  } catch (err) {
    console.error('[API Error]:', err);
    sendJson(res, 500, { error: (err as Error).message });
    return true;
  }
}
