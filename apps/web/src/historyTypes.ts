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
  snapshot_base64: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}
