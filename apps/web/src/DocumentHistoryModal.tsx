import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import {
  History,
  X,
  User,
  RotateCcw,
  GitCompare,
  Eye,
  Bookmark,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { DocumentCheckpoint, CheckpointDetail } from './historyTypes';
import { computeLineDiff } from './diffUtils';

interface DocumentHistoryModalProps {
  documentId: string;
  documentTitle: string;
  isOpen: boolean;
  onClose: () => void;
  isViewer: boolean;
  onVersionRestored: () => void;
}

export const DocumentHistoryModal: React.FC<DocumentHistoryModalProps> = ({
  documentId,
  documentTitle,
  isOpen,
  onClose,
  isViewer,
  onVersionRestored,
}) => {
  const [checkpoints, setCheckpoints] = useState<DocumentCheckpoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Manual save state
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveLabel, setSaveLabel] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Selected version preview state
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CheckpointDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Live state for comparison & restore guard
  const [currentLiveState, setCurrentLiveState] = useState<{
    content_hash: string;
    plain_text: string;
  } | null>(null);

  // Tab: 'preview' | 'compare'
  const [viewTab, setViewTab] = useState<'preview' | 'compare'>('preview');

  // Confirmation state before restoring
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // Fetch checkpoints list
  const fetchCheckpoints = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/checkpoints?limit=100`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load versions (${res.status})`);
      }
      const data = await res.json();
      setCheckpoints(data.checkpoints || []);
      if (data.checkpoints && data.checkpoints.length > 0 && !selectedCheckpointId) {
        setSelectedCheckpointId(data.checkpoints[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading history');
    } finally {
      setLoading(false);
    }
  };

  // Fetch current live state
  const fetchLiveState = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/current-state`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentLiveState({
          content_hash: data.content_hash,
          plain_text: data.plain_text,
        });
      }
    } catch (err) {
      console.error('Failed to fetch live state:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCheckpoints();
      fetchLiveState();
      setRestoreError(null);
      setRestoreSuccess(null);
    } else {
      setSelectedCheckpointId(null);
      setSelectedDetail(null);
      setShowRestoreConfirm(false);
    }
  }, [isOpen, documentId]);

  // Fetch detail for selected checkpoint
  useEffect(() => {
    if (!selectedCheckpointId || !isOpen) return;

    let isMounted = true;
    setLoadingDetail(true);
    fetch(`/api/documents/${documentId}/checkpoints/${selectedCheckpointId}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load version content');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setSelectedDetail(data.checkpoint);
          setLoadingDetail(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          setLoadingDetail(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCheckpointId, documentId, isOpen]);

  // Focus management refs
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreConfirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus close button on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Focus confirm button when restore dialog opens
  useEffect(() => {
    if (showRestoreConfirm) {
      setTimeout(() => {
        restoreConfirmButtonRef.current?.focus();
      }, 50);
    }
  }, [showRestoreConfirm]);

  // Keyboard navigation & Escape-to-close behavior
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showRestoreConfirm) {
          setShowRestoreConfirm(false);
        } else if (showSaveModal) {
          setShowSaveModal(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showRestoreConfirm, showSaveModal, onClose]);

  // Create isolated Y.Doc for preview (never connected to Hocuspocus provider or network)
  const previewDoc = useMemo(() => {
    if (!selectedDetail?.snapshot_base64) return null;
    const doc = new Y.Doc();
    const binary = Uint8Array.from(atob(selectedDetail.snapshot_base64), (c) => c.charCodeAt(0));
    Y.applyUpdate(doc, binary);
    return doc;
  }, [selectedDetail]);

  // Initialize read-only preview editor
  const previewEditor = useEditor(
    {
      editable: false,
      extensions: previewDoc
        ? [
          StarterKit.configure({ history: false }),
          Collaboration.configure({ document: previewDoc }),
        ]
        : [StarterKit],
      editorProps: {
        attributes: {
          class: 'syncraft-prosemirror preview-editor-canvas',
          'data-testid': 'version-preview-canvas',
        },
      },
    },
    [previewDoc]
  );

  // Handle manual "Save version"
  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isViewer) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/checkpoints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ label: saveLabel.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save version');
      }

      setSaveLabel('');
      setShowSaveModal(false);
      await fetchCheckpoints();
      await fetchLiveState();
    } catch (err: any) {
      alert(err.message || 'Error saving version');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Safe Version Restore
  const handleRestoreSubmit = async () => {
    if (!selectedCheckpointId || !currentLiveState || isRestoring || isViewer) return;

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);

    const idempotencyKey = `restore-${selectedCheckpointId}-${Date.now()}`;

    try {
      const res = await fetch(`/api/documents/${documentId}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
          checkpoint_id: selectedCheckpointId,
          expected_base_hash: currentLiveState.content_hash,
          idempotency_key: idempotencyKey,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setRestoreError(data.error || 'The live document was modified. Please review again.');
        setShowRestoreConfirm(false);
        await fetchLiveState();
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to restore version');
      }

      setRestoreSuccess('Version restored successfully. All connected collaborators will see the restored content.');
      setShowRestoreConfirm(false);
      onVersionRestored();
      await fetchCheckpoints();
      await fetchLiveState();
    } catch (err: any) {
      setRestoreError(err.message || 'Failed to restore version');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      data-testid="document-history-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-dialog-title"
    >
      <div ref={modalContainerRef} className="history-modal-card">
        {/* Header */}
        <div className="history-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(31, 111, 235, 0.15)',
                color: 'var(--accent-blue-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <History size={20} />
            </div>
            <div>
              <h2
                id="history-dialog-title"
                style={{
                  fontSize: '17px',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                Version History: <span style={{ color: '#fff' }}>{documentTitle}</span>
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                Inspect immutable checkpoints, preview past revisions, compare text diffs, and restore safely.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!isViewer && (
              <button
                type="button"
                onClick={() => setShowSaveModal(true)}
                data-testid="btn-save-version-open"
                className="btn-primary"
                style={{ width: 'auto', padding: '7px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Bookmark size={15} />
                Save Version
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              data-testid="btn-close-history-modal"
              className="btn-icon"
              style={{ color: 'var(--text-muted)', padding: '6px' }}
              aria-label="Close version history"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {restoreError && (
          <div
            data-testid="restore-error-alert"
            style={{
              padding: '10px 24px',
              backgroundColor: 'rgba(248, 81, 73, 0.15)',
              borderBottom: '1px solid rgba(248, 81, 73, 0.35)',
              color: 'var(--color-offline)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{restoreError}</span>
          </div>
        )}
        {restoreSuccess && (
          <div
            data-testid="restore-success-alert"
            style={{
              padding: '10px 24px',
              backgroundColor: 'rgba(63, 185, 80, 0.15)',
              borderBottom: '1px solid rgba(63, 185, 80, 0.35)',
              color: 'var(--color-online)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{restoreSuccess}</span>
          </div>
        )}

        {/* Body (Split View) */}
        <div className="history-body">
          {/* Left: Versions Sidebar */}
          <div className="history-sidebar">
            <div className="history-sidebar-header">
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.6px' }}>
                Checkpoints ({checkpoints.length})
              </span>
              <button
                type="button"
                onClick={fetchCheckpoints}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '12px',
                  color: 'var(--accent-blue-hover)',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Refresh history"
              >
                Refresh
              </button>
            </div>

            <div className="history-list">
              {loading && checkpoints.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-muted)' }}>
                  Loading versions...
                </div>
              ) : error ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13.5px', color: 'var(--color-offline)' }}>
                  {error}
                </div>
              ) : checkpoints.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-muted)' }}>
                  No versions saved yet. Click "Save Version" to create the first checkpoint.
                </div>
              ) : (
                checkpoints.map((cp) => {
                  const isSelected = cp.id === selectedCheckpointId;
                  const dateStr = new Date(cp.created_at).toLocaleString();

                  return (
                    <button
                      key={cp.id}
                      type="button"
                      onClick={() => {
                        setSelectedCheckpointId(cp.id);
                        setShowRestoreConfirm(false);
                      }}
                      data-testid={`checkpoint-item-${cp.id}`}
                      className={`history-item ${isSelected ? 'active' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span
                          className={`badge-version ${cp.kind === 'manual'
                              ? 'badge-manual'
                              : cp.kind === 'pre_restore'
                                ? 'badge-pre-restore'
                                : 'badge-automatic'
                            }`}
                        >
                          {cp.kind === 'manual'
                            ? 'Manual'
                            : cp.kind === 'pre_restore'
                              ? 'Pre-restore'
                              : 'Automatic'}
                        </span>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-dim)' }}>{dateStr}</span>
                      </div>

                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cp.label || (cp.kind === 'automatic' ? 'Automatic Checkpoint' : 'Untitled Version')}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <User size={12} style={{ flexShrink: 0 }} />
                        <span>
                          {cp.kind === 'automatic'
                            ? 'Multi-user shared edit'
                            : cp.creator_name || cp.creator_email || 'System'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Preview / Diff Workspace */}
          <div className="history-preview-pane">
            {selectedDetail ? (
              <>
                {/* View Toolbar */}
                <div className="history-preview-toolbar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setViewTab('preview')}
                      data-testid="tab-version-preview"
                      className={`btn-ghost ${viewTab === 'preview' ? 'active' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        backgroundColor: viewTab === 'preview' ? 'var(--bg-tertiary)' : 'transparent',
                        color: viewTab === 'preview' ? 'var(--text-main)' : 'var(--text-muted)',
                        border: viewTab === 'preview' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <Eye size={14} />
                      Read-Only Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewTab('compare')}
                      data-testid="tab-version-compare"
                      className={`btn-ghost ${viewTab === 'compare' ? 'active' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        backgroundColor: viewTab === 'compare' ? 'var(--bg-tertiary)' : 'transparent',
                        color: viewTab === 'compare' ? 'var(--text-main)' : 'var(--text-muted)',
                        border: viewTab === 'compare' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <GitCompare size={14} />
                      Compare with Current
                    </button>
                  </div>

                  {!isViewer && (
                    <button
                      type="button"
                      onClick={() => setShowRestoreConfirm(true)}
                      data-testid="btn-restore-version-open"
                      disabled={isRestoring}
                      className="btn-warning"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '13px' }}
                    >
                      <RotateCcw size={14} />
                      Restore This Version
                    </button>
                  )}
                </div>

                {/* Main Content Area */}
                <div className="history-preview-content">
                  {loadingDetail ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                      Loading version snapshot...
                    </div>
                  ) : viewTab === 'preview' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div
                        style={{
                          padding: '10px 14px',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '12.5px',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>
                          Version ID: <code style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{selectedDetail.id}</code>
                        </span>
                        <span>
                          Hash: <code style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{selectedDetail.content_hash.slice(0, 10)}...</code>
                        </span>
                      </div>
                      <div
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '24px 28px',
                          backgroundColor: 'var(--bg-primary)',
                          minHeight: '340px',
                        }}
                      >
                        <EditorContent editor={previewEditor} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} data-testid="version-diff-container">
                      <div
                        style={{
                          padding: '10px 14px',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '12.5px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <p style={{ margin: 0 }}>
                          <strong style={{ color: 'var(--text-main)' }}>Text Diff:</strong> Comparing selected version against the live current document.
                          <span style={{ color: 'var(--text-dim)', marginLeft: '6px' }}>
                            (Comparison covers text lines; rich-text marks like bold/italic are rendered in the Preview tab).
                          </span>
                        </p>
                      </div>

                      <div className="diff-container">
                        {computeLineDiff(selectedDetail.summary_text, currentLiveState?.plain_text || '').map(
                          (line, idx) => (
                            <div
                              key={idx}
                              className={`diff-line ${line.type === 'added'
                                  ? 'diff-line-added'
                                  : line.type === 'removed'
                                    ? 'diff-line-removed'
                                    : 'diff-line-neutral'
                                }`}
                            >
                              <span className="diff-marker">
                                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                              </span>
                              <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{line.text || ' '}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                Select a version on the left to preview or compare.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="history-footer">
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {isViewer ? 'Read-only access: Viewers cannot create or restore versions.' : 'All restore actions are reversible via automatic pre-restore snapshots.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-history-done"
            className="btn-secondary"
            style={{ padding: '7px 16px', fontSize: '13px' }}
          >
            Return to Live Editor
          </button>
        </div>
      </div>

      {/* Save Version Sub-Modal */}
      {showSaveModal && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <form
            onSubmit={handleSaveVersion}
            data-testid="save-version-dialog"
            className="modal-card"
            style={{ maxWidth: '440px', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: 600, fontSize: '17px', marginBottom: '6px' }}>
              <Bookmark size={20} color="var(--accent-blue-hover)" />
              <span>Save Version Checkpoint</span>
            </div>
            <p className="modal-desc" style={{ marginBottom: '16px', fontSize: '13px' }}>
              Create an immutable snapshot of the current shared document in its authoritative live state.
            </p>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Version Label (Optional)
              </label>
              <input
                type="text"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="e.g. Sprint 1 Final, Approved by Team"
                data-testid="input-save-version-label"
                className="input-field"
                style={{ marginBottom: 0 }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                data-testid="btn-submit-save-version"
                className="btn-primary"
                style={{ width: 'auto', padding: '8px 16px' }}
              >
                {isSaving ? 'Saving...' : 'Save Checkpoint'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Restore Confirmation Sub-Modal */}
      {showRestoreConfirm && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div
            data-testid="restore-confirm-dialog"
            className="modal-card"
            style={{ maxWidth: '480px', padding: '24px', border: '1px solid rgba(210, 153, 34, 0.5)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f0883e', fontWeight: 600, fontSize: '17px', marginBottom: '8px' }}>
              <AlertTriangle size={22} />
              <span>Confirm Document Restoration</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-main)', marginBottom: '20px' }}>
              <p style={{ margin: 0 }}>
                <strong>Important:</strong> Restoring this version will immediately change the shared document for{' '}
                <span style={{ color: '#e3b341', fontWeight: 600 }}>all active collaborators</span> currently editing.
              </p>
              <p style={{ margin: 0 }}>
                A <strong>pre-restore checkpoint</strong> will be created automatically before applying changes, allowing you to reverse this restore at any time.
              </p>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                If another user edits the document while you confirm, the restoration will be rejected safely with a concurrency warning.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setShowRestoreConfirm(false)}
                data-testid="btn-cancel-restore"
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                ref={restoreConfirmButtonRef}
                type="button"
                onClick={handleRestoreSubmit}
                disabled={isRestoring}
                data-testid="btn-confirm-restore"
                className="btn-warning"
                style={{ width: 'auto', padding: '8px 16px' }}
              >
                {isRestoring ? 'Restoring...' : 'Confirm & Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
