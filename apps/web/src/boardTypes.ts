export interface BoardSummary {
  id: string;
  workspace_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  position: number;
  version: number;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
}
