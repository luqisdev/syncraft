import { DatabaseAdapter } from './db.js';

export async function runMigrations(db: DatabaseAdapter): Promise<void> {
  console.log('[Database] Applying database migrations...');

  // 1. Documents table (for Yjs binary CRDT states)
  await db.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id VARCHAR(255) PRIMARY KEY,
      data BYTEA NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Users table
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Sessions table
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      revoked_at TIMESTAMP WITH TIME ZONE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  // 4. Workspaces table
  await db.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5. Workspace Memberships table
  await db.query(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
  `);

  // 6. Workspace Documents metadata table
  await db.query(`
    CREATE TABLE IF NOT EXISTS workspace_documents (
      id VARCHAR(255) PRIMARY KEY,
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_documents_workspace ON workspace_documents(workspace_id);
  `);

  // 7. Project Boards
  await db.query(`
    CREATE TABLE IF NOT EXISTS project_boards (
      id VARCHAR(36) PRIMARY KEY,
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_project_boards_workspace ON project_boards(workspace_id);
  `);

  // 8. Board Columns
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_columns (
      id VARCHAR(36) PRIMARY KEY,
      board_id VARCHAR(36) NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
      title VARCHAR(100) NOT NULL,
      position INT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_board_columns_board ON board_columns(board_id);
  `);

  // 9. Tasks
  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(36) PRIMARY KEY,
      board_id VARCHAR(36) NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
      column_id VARCHAR(36) NOT NULL REFERENCES board_columns(id) ON DELETE RESTRICT,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      due_date DATE,
      assignee_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      position INT NOT NULL,
      version INT NOT NULL DEFAULT 1,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_board_column ON tasks(board_id, column_id, archived, position);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  `);

  // 10. Idempotency Keys for task creation
  await db.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      client_key VARCHAR(128) PRIMARY KEY,
      task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);
  `);

  // 11. Document Checkpoints (Milestone 4 Version History)
  await db.query(`
    CREATE TABLE IF NOT EXISTS document_checkpoints (
      id VARCHAR(36) PRIMARY KEY,
      document_id VARCHAR(128) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind VARCHAR(20) NOT NULL CHECK (kind IN ('manual', 'automatic', 'pre_restore')),
      label VARCHAR(255),
      created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      content_hash VARCHAR(64) NOT NULL,
      snapshot_data BYTEA NOT NULL,
      summary_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_doc_time ON document_checkpoints(document_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_workspace ON document_checkpoints(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_doc_hash ON document_checkpoints(document_id, content_hash);
  `);

  // 12. Restore Idempotency Keys
  await db.query(`
    CREATE TABLE IF NOT EXISTS restore_idempotency_keys (
      client_key VARCHAR(128) PRIMARY KEY,
      document_id VARCHAR(128) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      checkpoint_id VARCHAR(36) NOT NULL REFERENCES document_checkpoints(id) ON DELETE CASCADE,
      pre_restore_id VARCHAR(36) REFERENCES document_checkpoints(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_restore_idemp_created ON restore_idempotency_keys(created_at);
  `);

  // 13. Completed Document Restorations Log (for reliable offline recovery detection)
  await db.query(`
    CREATE TABLE IF NOT EXISTS document_restorations (
      id VARCHAR(36) PRIMARY KEY,
      document_id VARCHAR(128) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      checkpoint_id VARCHAR(36) NOT NULL REFERENCES document_checkpoints(id) ON DELETE CASCADE,
      pre_restore_id VARCHAR(36) REFERENCES document_checkpoints(id) ON DELETE SET NULL,
      restored_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      revision INT NOT NULL DEFAULT 1,
      restored_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_doc_restorations_doc_time ON document_restorations(document_id, restored_at DESC);
  `);
  // Ensure revision column exists for upgraded databases before creating index on it
  await db.query(`
    ALTER TABLE document_restorations ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_doc_restorations_doc_rev ON document_restorations(document_id, revision DESC);
  `);

  console.log('[Database] Database migrations applied successfully.');
}

