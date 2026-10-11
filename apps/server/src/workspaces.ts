import { DatabaseAdapter } from './db.js';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  created_by: string;
  role?: WorkspaceRole;
  created_at: Date;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  name: string;
  email: string;
  joined_at: Date;
}

export interface WorkspaceDocument {
  id: string;
  workspace_id: string;
  title: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export async function getUserRoleInWorkspace(
  db: DatabaseAdapter,
  workspaceId: string,
  userId: string
): Promise<WorkspaceRole | null> {
  const res = await db.query(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].role as WorkspaceRole;
}

export async function getDocumentAccess(
  db: DatabaseAdapter,
  documentId: string,
  userId: string
): Promise<{ allowed: boolean; role: WorkspaceRole | null; workspaceId: string | null }> {
  // Check if document belongs to a workspace
  const docRes = await db.query(
    `SELECT workspace_id FROM workspace_documents WHERE id = $1`,
    [documentId]
  );

  if (docRes.rows.length === 0) {
    // If not in workspace_documents, check if legacy demo document
    return { allowed: false, role: null, workspaceId: null };
  }

  const workspaceId = docRes.rows[0].workspace_id;
  const role = await getUserRoleInWorkspace(db, workspaceId, userId);

  return {
    allowed: role !== null,
    role,
    workspaceId,
  };
}
