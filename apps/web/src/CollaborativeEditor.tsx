import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import { getInitials } from './utils';
import {
  HardDrive,
  FileText,
  Menu,
  RefreshCw,
  Plus,
  Users,
  LogOut,
  Edit2,
  Check,
  X,
  AlertTriangle,
  Kanban,
  History,
  Copy,
  Download,
  Eye,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  MoreVertical,
} from 'lucide-react';
import { MembersModal } from './MembersModal';
import { ProjectBoardView } from './ProjectBoardView';
import { DocumentHistoryModal } from './DocumentHistoryModal';
import { BoardSummary, WorkspaceMember } from './boardTypes';
import { extractPlainTextFromYDoc } from './diffUtils';

export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  color: string;
  sessionId?: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  created_by: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface DocumentSummary {
  id: string;
  workspace_id: string;
  title: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

interface Participant {
  clientId: number;
  name: string;
  color: string;
}

interface CollaborativeEditorProps {
  user: UserIdentity;
  workspaces: WorkspaceSummary[];
  currentWorkspace: WorkspaceSummary | null;
  documents: DocumentSummary[];
  activeDocumentId: string;
  boards?: BoardSummary[];
  activeBoardId?: string;
  activeNav?: 'docs' | 'boards';
  workspaceMembers?: WorkspaceMember[];
  serverUrl: string;
  onSelectWorkspace: (wsId: string) => void;
  onCreateWorkspace: (name: string) => void;
  onSelectDoc: (id: string) => void;
  onCreateDoc: (title: string) => void;
  onRenameDoc: (id: string, newTitle: string) => void;
  onSelectBoard?: (id: string) => void;
  onCreateBoard?: (title: string) => void;
  onSelectNav?: (nav: 'docs' | 'boards') => void;
  onLogout: () => void;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  user,
  workspaces,
  currentWorkspace,
  documents,
  activeDocumentId,
  boards = [],
  activeBoardId = '',
  activeNav = 'docs',
  workspaceMembers = [],
  serverUrl,
  onSelectWorkspace,
  onCreateWorkspace,
  onSelectDoc,
  onCreateDoc,
  onRenameDoc,
  onSelectBoard,
  onCreateBoard,
  onSelectNav,
  onLogout,
}) => {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isSyncedWithServer, setIsSyncedWithServer] = useState<boolean>(false);
  const [isLocalPersistenceLoaded, setIsLocalPersistenceLoaded] = useState<boolean>(false);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string>('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState<boolean>(false);

  // Modals & form state
  const [showMembersModal, setShowMembersModal] = useState<boolean>(false);
  const [showCreateWsModal, setShowCreateWsModal] = useState<boolean>(false);
  const [newWsName, setNewWsName] = useState<string>('');
  const [showCreateDocModal, setShowCreateDocModal] = useState<boolean>(false);
  const [newDocTitle, setNewDocTitle] = useState<string>('');
  const [isRenamingDoc, setIsRenamingDoc] = useState<boolean>(false);
  const [renameDocTitle, setRenameDocTitle] = useState<string>('');
  const [showCreateBoardModal, setShowCreateBoardModal] = useState<boolean>(false);
  const [newBoardTitle, setNewBoardTitle] = useState<string>('');
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [offlineDraft, setOfflineDraft] = useState<string | null>(null);
  const [draftRestorationUncertain, setDraftRestorationUncertain] = useState<boolean>(false);
  const [showDraftModal, setShowDraftModal] = useState<boolean>(false);
  const [copiedDraft, setCopiedDraft] = useState<boolean>(false);

  const [instances, setInstances] = useState<{
    ydoc: Y.Doc;
    provider: HocuspocusProvider;
    indexeddbProvider: IndexeddbPersistence;
  } | null>(null);

  const activeDoc = documents.find((d) => d.id === activeDocumentId);
  const activeDocTitle = activeDoc?.title || activeDocumentId;
  const userRole = currentWorkspace?.role || 'viewer';
  const isViewer = userRole === 'viewer';
  const isOwner = userRole === 'owner';
  const draftStorageKey = `syncraft-offline-draft-${user.id}-${activeDocumentId}`;
  const baselineRevKey = `syncraft-offline-draft-rev-${user.id}-${activeDocumentId}`;

  // Setup providers once per activeDocumentId, user.id, and serverUrl
  useEffect(() => {
    if (!activeDocumentId) return;

    setAccessDenied(false);
    setAccessDeniedMessage('');

    const doc = new Y.Doc();

    // Secure, namespaced IndexedDB persistence per user and per document
    const idbName = `syncraft-doc-${user.id}-${activeDocumentId}`;
    const idbProvider = new IndexeddbPersistence(idbName, doc);
    idbProvider.on('synced', () => {
      setIsLocalPersistenceLoaded(true);
    });

    // Load any existing persisted draft for this user and document on mount/doc switch
    let loadedBaselineRev: number | null = null;
    try {
      const persistedDraft = localStorage.getItem(draftStorageKey);
      if (persistedDraft) {
        setOfflineDraft(persistedDraft);
      }
      const persistedRevStr = localStorage.getItem(baselineRevKey);
      if (persistedRevStr !== null) {
        const parsed = parseInt(persistedRevStr, 10);
        if (!isNaN(parsed)) {
          loadedBaselineRev = parsed;
        }
      }
    } catch (_e) {
      // ignore localStorage errors
    }

    let isCurrentlyOffline = !navigator.onLine;
    let wasDisconnected = isCurrentlyOffline;
    let acknowledgedRevision = loadedBaselineRev;

    const captureLatestDraft = () => {
      try {
        const text = extractPlainTextFromYDoc(doc);
        if (text) {
          try {
            localStorage.setItem(draftStorageKey, text);
            if (acknowledgedRevision !== null) {
              localStorage.setItem(baselineRevKey, acknowledgedRevision.toString());
            }
          } catch (_err) {
            // ignore
          }
        }
        return text;
      } catch (_e) {
        return null;
      }
    };

    // Keep draft updated whenever local changes occur while disconnected
    const handleDocUpdateWhileOffline = () => {
      if (isCurrentlyOffline) {
        captureLatestDraft();
      }
    };
    doc.on('update', handleDocUpdateWhileOffline);

    // Fetch authoritative server restoration cursor/revision with brief retry for reconnection
    const fetchAuthoritativeRevision = async (retries = 3): Promise<number | null> => {
      if (!activeDocumentId) return null;
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const res = await fetch(`/api/documents/${activeDocumentId}/restorations?limit=1`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            if (typeof data.latestRevision === 'number') {
              return data.latestRevision;
            }
            if (Array.isArray(data.restorations) && data.restorations.length > 0) {
              return data.restorations[0].revision || 0;
            }
            return 0;
          }
        } catch (_e) {
          // network or server error, brief backoff if retrying
          if (attempt < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }
      }
      return null;
    };

    const checkForRestorationDuringOffline = async (): Promise<boolean> => {
      if (!activeDocumentId) return false;
      try {
        const serverRev = await fetchAuthoritativeRevision(4);
        if (serverRev !== null) {
          if (acknowledgedRevision === null) {
            // Existing draft lacks a revision baseline.
            // Explain uncertainty honestly without falsely asserting that a restore occurred.
            const currentDraft = localStorage.getItem(draftStorageKey) || captureLatestDraft();
            if (currentDraft) {
              setOfflineDraft(currentDraft);
              setDraftRestorationUncertain(true);
            }
            acknowledgedRevision = serverRev;
            try {
              localStorage.setItem(baselineRevKey, serverRev.toString());
            } catch (_e) {
              // ignore
            }
          } else if (serverRev > acknowledgedRevision) {
            // An authoritative completed restoration occurred while this client was disconnected!
            // Read the draft captured while offline, or capture if not yet stored
            const currentDraft = localStorage.getItem(draftStorageKey) || captureLatestDraft();
            if (currentDraft) {
              setOfflineDraft(currentDraft);
              setDraftRestorationUncertain(false);
              try {
                localStorage.setItem(draftStorageKey, currentDraft);
                localStorage.setItem(baselineRevKey, acknowledgedRevision.toString());
              } catch (_e) {
                // ignore
              }
            }
          } else {
            // No new completed restorations occurred.
            // Normal offline edits reconcile via CRDT. Update acknowledged revision to serverRev.
            acknowledgedRevision = serverRev;
            try {
              localStorage.setItem(baselineRevKey, serverRev.toString());
            } catch (_e) {
              // ignore
            }
          }
          return true;
        }
      } catch (_err) {
        // ignore network failure
      }
      return false;
    };

    const hpProvider = new HocuspocusProvider({
      url: serverUrl,
      name: activeDocumentId,
      document: doc,
      token: user.sessionId || '',
      parameters: {
        userId: user.id,
        token: user.sessionId || '',
      },
      onStatus: (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
        setConnectionStatus(event.status);
        if (event.status === 'disconnected') {
          isCurrentlyOffline = true;
          wasDisconnected = true;
          captureLatestDraft();
        } else if (event.status === 'connected') {
          isCurrentlyOffline = false;
        }
      },
      onSynced: async (data: { state: boolean }) => {
        setIsSyncedWithServer(data.state);
        if (data.state) {
          if (wasDisconnected) {
            const checked = await checkForRestorationDuringOffline();
            if (checked) {
              wasDisconnected = false;
            }
          } else if (acknowledgedRevision === null) {
            // Initial load while connected: capture current authoritative revision as baseline
            const currentRev = await fetchAuthoritativeRevision();
            if (currentRev !== null) {
              acknowledgedRevision = currentRev;
              try {
                localStorage.setItem(baselineRevKey, currentRev.toString());
              } catch (_e) {
                // ignore
              }
            }
          }
        }
      },
      onAuthenticationFailed: (data: { reason: string }) => {
        setAccessDenied(true);
        setAccessDeniedMessage(data.reason || 'Authentication failed or access denied.');
      },
      onClose: (data: any) => {
        // Hocuspocus close event
        const reason = data?.event?.reason || '';
        const code = data?.event?.code;
        if (
          code === 4403 ||
          code === 4401 ||
          reason.includes('Access denied') ||
          reason.includes('revoked') ||
          reason.includes('Forbidden') ||
          reason.includes('Unauthorized') ||
          reason.includes('permission') ||
          reason.includes('expired')
        ) {
          setAccessDenied(true);
          setAccessDeniedMessage(reason || 'Access denied or session expired for this document.');
        }
      },
    });

    const handleWindowOffline = () => {
      isCurrentlyOffline = true;
      wasDisconnected = true;
      setConnectionStatus('disconnected');
      captureLatestDraft();
      hpProvider.disconnect();
    };

    const handleWindowOnline = async () => {
      setConnectionStatus('connecting');
      // Capture the latest offline edits before incoming remote updates arrive
      captureLatestDraft();
      isCurrentlyOffline = false;
      const checked = await checkForRestorationDuringOffline();
      if (checked) {
        wasDisconnected = false;
      }
      hpProvider.connect();
    };

    window.addEventListener('offline', handleWindowOffline);
    window.addEventListener('online', handleWindowOnline);

    // Set initial awareness with user details
    hpProvider.setAwarenessField('user', {
      name: user.name,
      color: user.color,
      userId: user.id,
      role: userRole,
    });

    const updateAwareness = () => {
      if (!hpProvider.awareness) return;
      const states = hpProvider.awareness.getStates();
      const currentParticipants: Participant[] = [];
      states.forEach((state, clientId) => {
        if (state.user?.name) {
          currentParticipants.push({
            clientId,
            name: state.user.name,
            color: state.user.color || '#58a6ff',
          });
        }
      });
      setParticipants(currentParticipants);
    };

    hpProvider.on('awarenessUpdate', updateAwareness);
    if (hpProvider.awareness) {
      hpProvider.awareness.on('change', updateAwareness);
      updateAwareness();
    }

    setInstances({
      ydoc: doc,
      provider: hpProvider,
      indexeddbProvider: idbProvider,
    });

    return () => {
      window.removeEventListener('offline', handleWindowOffline);
      window.removeEventListener('online', handleWindowOnline);
      if (hpProvider.awareness) {
        hpProvider.awareness.off('change', updateAwareness);
      }
      doc.off('update', handleDocUpdateWhileOffline);
      hpProvider.destroy();
      idbProvider.destroy();
      doc.destroy();
      setInstances(null);
    };
  }, [activeDocumentId, user.id, serverUrl, userRole]);

  // Update awareness on user details change
  useEffect(() => {
    if (instances?.provider) {
      instances.provider.setAwarenessField('user', {
        name: user.name,
        color: user.color,
        userId: user.id,
        role: userRole,
      });
    }
  }, [user, userRole, instances]);

  // Initialize Tiptap Editor with viewer-aware editable configuration
  const editor = useEditor(
    {
      editable: !isViewer && !accessDenied,
      extensions: instances
        ? [
            StarterKit.configure({
              history: false,
            }),
            Collaboration.configure({
              document: instances.ydoc,
            }),
            CollaborationCursor.configure({
              provider: instances.provider,
              user: {
                name: user.name,
                color: user.color,
              },
            }),
          ]
        : [StarterKit],
      editorProps: {
        attributes: {
          class: 'syncraft-prosemirror',
          'data-testid': 'editor-canvas',
        },
      },
    },
    [instances, isViewer, accessDenied]
  );

  // Sync editor editable property if role changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isViewer && !accessDenied);
    }
  }, [editor, isViewer, accessDenied]);

  const handleCreateWsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    onCreateWorkspace(newWsName.trim());
    setNewWsName('');
    setShowCreateWsModal(false);
  };

  const handleCreateDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;
    onCreateDoc(newDocTitle.trim());
    setNewDocTitle('');
    setShowCreateDocModal(false);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameDocTitle.trim() || !activeDoc) return;
    onRenameDoc(activeDoc.id, renameDocTitle.trim());
    setIsRenamingDoc(false);
  };

  // Reset document rename state whenever navigation view or active document changes
  useEffect(() => {
    setIsRenamingDoc(false);
  }, [activeNav, activeDocumentId]);

  const activeBoard = boards.find((b) => b.id === activeBoardId);
  const activeBoardTitle = activeBoard?.title || 'Project Board';

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="brand">
              <div className="brand-logo">S</div>
              <span className="brand-name">Syncraft</span>
            </div>
            {isOwner && (
              <button
                className="btn-icon"
                onClick={() => setShowMembersModal(true)}
                title="Manage Workspace Members"
                data-testid="btn-manage-members"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Users size={14} />
                <span>Members</span>
              </button>
            )}
          </div>

          {/* Workspace Switcher */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 2px' }}>
              <span>Workspace</span>
              <span style={{ textTransform: 'capitalize', color: 'var(--accent-blue-hover)', fontWeight: 600 }}>{userRole}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={currentWorkspace?.id || ''}
                onChange={(e) => onSelectWorkspace(e.target.value)}
                className="input-field"
                style={{
                  marginBottom: 0,
                  padding: '7px 10px',
                  fontSize: '13.5px',
                  flex: 1,
                  cursor: 'pointer',
                }}
                data-testid="workspace-select"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.role})
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowCreateWsModal(true)}
                className="btn-icon"
                title="Create Workspace"
                data-testid="btn-create-workspace-dialog"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '6px 8px',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                }}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Workspace Views Navigation: Documents vs Boards */}
        <div style={{ display: 'flex', padding: '0 12px 10px 12px', gap: '6px' }}>
          <button
            type="button"
            data-testid="nav-documents-tab"
            onClick={() => onSelectNav && onSelectNav('docs')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: activeNav === 'docs' ? 600 : 500,
              backgroundColor: activeNav === 'docs' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeNav === 'docs' ? 'var(--text-main)' : 'var(--text-dim)',
              border: activeNav === 'docs' ? '1px solid var(--border-subtle)' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <FileText size={14} />
            Documents
          </button>
          <button
            type="button"
            data-testid="nav-boards-tab"
            onClick={() => onSelectNav && onSelectNav('boards')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: activeNav === 'boards' ? 600 : 500,
              backgroundColor: activeNav === 'boards' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeNav === 'boards' ? 'var(--text-main)' : 'var(--text-dim)',
              border: activeNav === 'boards' ? '1px solid var(--border-subtle)' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Kanban size={14} />
            Boards
          </button>
        </div>

        {/* Documents Navigation List */}
        {activeNav === 'docs' ? (
          <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px 6px 12px',
              }}
            >
              <div className="sidebar-section-title" style={{ padding: 0 }}>
                Documents
              </div>
              {!isViewer && (
                <button
                  onClick={() => setShowCreateDocModal(true)}
                  className="btn-icon"
                  title="Create Document"
                  data-testid="btn-create-doc-dialog"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '12.5px', color: 'var(--text-dim)', textAlign: 'center' }}>
                No documents yet
              </div>
            ) : (
              <ul className="doc-list" role="list">
                {documents.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      data-testid={`doc-select-${doc.id}`}
                      className={`doc-item ${doc.id === activeDocumentId ? 'active' : ''}`}
                      onClick={() => {
                        onSelectDoc(doc.id);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <FileText size={16} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          /* Boards Navigation List */
          <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px 6px 12px',
              }}
            >
              <div className="sidebar-section-title" style={{ padding: 0 }}>
                Project Boards
              </div>
              {!isViewer && (
                <button
                  onClick={() => setShowCreateBoardModal(true)}
                  className="btn-icon"
                  title="Create Board"
                  data-testid="btn-create-board-dialog"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {boards.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '12.5px', color: 'var(--text-dim)', textAlign: 'center' }}>
                No boards yet.
                {!isViewer && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowCreateBoardModal(true)}
                      className="btn-primary"
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                      data-testid="btn-empty-create-board"
                    >
                      Create First Board
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="doc-list" role="list">
                {boards.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      data-testid={`board-select-${b.id}`}
                      className={`doc-item ${b.id === activeBoardId ? 'active' : ''}`}
                      onClick={() => {
                        if (onSelectBoard) onSelectBoard(b.id);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <Kanban size={16} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Sidebar Footer with Authenticated User & Logout */}
        <div className="sidebar-footer">
          <div className="user-profile" style={{ flex: 1 }}>
            <div
              className="user-avatar"
              style={{ backgroundColor: user.color }}
              title={user.name}
              data-testid="current-user-avatar"
            >
              {getInitials(user.name)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span className="user-name-text" data-testid="current-user-name" style={{ fontSize: '13px', fontWeight: 600 }}>
                {user.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </span>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="btn-icon"
            data-testid="btn-logout"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Document / Board Workspace */}
      <main className="main-content" data-document-id={activeDocumentId || ''} data-testid="main-workspace-content">
        <header className="navbar">
          <div className="navbar-left">
            <button
              className="mobile-menu-btn btn-icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} />
            </button>

            {activeNav === 'boards' ? (
              /* Board Header View */
              <div className="doc-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Kanban size={17} style={{ color: 'var(--accent-purple)' }} />
                <span data-testid="active-board-title-text" style={{ fontWeight: 600, fontSize: '15px' }}>
                  {activeBoardTitle}
                </span>
                {isViewer && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      backgroundColor: 'rgba(210, 153, 34, 0.15)',
                      color: 'var(--color-connecting)',
                      border: '1px solid rgba(210, 153, 34, 0.3)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                    data-testid="role-badge-viewer"
                  >
                    <Eye size={12} />
                    Viewer (Read-only)
                  </span>
                )}
              </div>
            ) : isRenamingDoc ? (
              /* Document Rename Form */
              <form onSubmit={handleRenameSubmit} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="text"
                  className="input-field"
                  style={{ marginBottom: 0, padding: '4px 8px', fontSize: '14px', width: '220px' }}
                  value={renameDocTitle}
                  onChange={(e) => setRenameDocTitle(e.target.value)}
                  autoFocus
                  data-testid="input-rename-document"
                />
                <button
                  type="submit"
                  className="btn-icon"
                  style={{ background: 'none', border: 'none', color: 'var(--color-online)', cursor: 'pointer' }}
                  data-testid="btn-save-rename"
                  title="Save title"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenamingDoc(false)}
                  className="btn-icon"
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                  title="Cancel rename"
                >
                  <X size={16} />
                </button>
              </form>
            ) : (
              /* Document Title Header */
              <div className="doc-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span data-testid="active-doc-title-text" style={{ fontWeight: 600, fontSize: '15px' }}>{activeDocTitle}</span>
                {!isViewer && (
                  <button
                    onClick={() => {
                      setRenameDocTitle(activeDocTitle);
                      setIsRenamingDoc(true);
                    }}
                    title="Rename Document"
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                    data-testid="btn-rename-doc"
                  >
                    <Edit2 size={13} />
                  </button>
                )}
                {isViewer && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      backgroundColor: 'rgba(210, 153, 34, 0.15)',
                      color: 'var(--color-connecting)',
                      border: '1px solid rgba(210, 153, 34, 0.3)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                    data-testid="role-badge-viewer"
                  >
                    <Eye size={12} />
                    Viewer (Read-only)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="navbar-right">
            {/* Connection Status Pill */}
            <div
              className={`status-pill status-${connectionStatus}`}
              data-testid="connection-status-pill"
              title={`Connection status: ${connectionStatus}`}
            >
              <span className="status-dot"></span>
              {connectionStatus === 'connected' && <span>Connected</span>}
              {connectionStatus === 'connecting' && <span>Reconnecting...</span>}
              {connectionStatus === 'disconnected' && <span>Offline Mode</span>}
            </div>

            {/* Document-specific indicators and actions */}
            {activeNav === 'docs' && (
              <>
                {/* Connection Transport Sync Indicator */}
                {connectionStatus === 'connected' && (
                  <div
                    className="persistence-tag desktop-only-indicator"
                    data-testid="server-sync-indicator"
                    title="Real-time transport connection active"
                    style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}
                  >
                    <RefreshCw size={13} className={isSyncedWithServer ? '' : 'spin'} />
                    <span>{isSyncedWithServer ? 'Synced' : 'Syncing...'}</span>
                  </div>
                )}

                {/* Local Storage Confirmation */}
                <div
                  className="persistence-tag desktop-only-indicator"
                  data-testid="local-persistence-indicator"
                  title="Local offline storage confirmation on this device"
                  style={{
                    fontSize: '12.5px',
                    color: connectionStatus === 'disconnected' ? 'var(--accent-blue-hover)' : 'var(--text-dim)',
                  }}
                >
                  <HardDrive size={13} />
                  <span>
                    {isLocalPersistenceLoaded
                      ? connectionStatus === 'disconnected'
                        ? 'Saved to this device'
                        : 'Saved to this device'
                      : 'Saving...'}
                  </span>
                </div>

                {/* Desktop Version History Button */}
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(true)}
                  data-testid="btn-open-history-modal"
                  className="btn-icon desktop-header-action"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '5px 11px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="View document version history, preview past checkpoints, and restore"
                >
                  <History size={14} style={{ color: 'var(--accent-blue-hover)' }} />
                  <span>History</span>
                </button>

                {/* Desktop Active Participants */}
                <div className="participants-bar desktop-header-action" data-testid="participants-list">
                  {participants.map((p) => (
                    <div
                      key={p.clientId}
                      className="participant-chip"
                      style={{ backgroundColor: p.color }}
                      title={`${p.name} ${p.name === user.name ? '(You)' : ''}`}
                      data-testid={`participant-${p.clientId}`}
                    >
                      {getInitials(p.name)}
                    </div>
                  ))}
                </div>

                {/* Mobile Overflow Menu Button */}
                <div className="mobile-header-overflow-wrapper" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setMobileOverflowOpen(!mobileOverflowOpen)}
                    data-testid="btn-mobile-overflow-toggle"
                    className="btn-icon mobile-overflow-btn"
                    title="More actions"
                    aria-label="More actions"
                    aria-expanded={mobileOverflowOpen}
                    style={{
                      padding: '6px',
                      backgroundColor: mobileOverflowOpen ? 'var(--bg-tertiary)' : 'transparent',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>

                  {mobileOverflowOpen && (
                    <div
                      data-testid="mobile-header-overflow-menu"
                      className="mobile-overflow-menu"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: '8px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                        padding: '8px',
                        minWidth: '200px',
                        zIndex: 70,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMobileOverflowOpen(false);
                          setShowHistoryModal(true);
                        }}
                        data-testid="btn-mobile-open-history"
                        className="btn-secondary"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          justifyContent: 'flex-start',
                          padding: '8px 12px',
                          fontSize: '13px',
                        }}
                      >
                        <History size={16} style={{ color: 'var(--accent-blue-hover)' }} />
                        <span>Version History</span>
                      </button>

                      {participants.length > 0 && (
                        <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Participants ({participants.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {participants.map((p) => (
                              <div
                                key={p.clientId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '12px',
                                  color: 'var(--text-main)',
                                }}
                              >
                                <span
                                  className="participant-chip"
                                  style={{ backgroundColor: p.color, width: '22px', height: '22px', fontSize: '10px' }}
                                >
                                  {getInitials(p.name)}
                                </span>
                                <span>{p.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Access Denied Warning Banner if permissions were revoked */}
        {accessDenied && (
          <div
            style={{
              backgroundColor: 'rgba(248, 81, 73, 0.15)',
              borderBottom: '1px solid rgba(248, 81, 73, 0.4)',
              color: 'var(--color-offline)',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13.5px',
            }}
            data-testid="access-denied-banner"
          >
            <AlertTriangle size={18} />
            <div>
              <strong>Access Denied:</strong> {accessDeniedMessage || 'Your permissions for this workspace or document have been revoked.'} Edits cannot be synced.
            </div>
          </div>
        )}

        {/* Offline Restoration Conflict Alert Banner */}
        {offlineDraft && (
          <div
            style={{
              backgroundColor: 'rgba(210, 153, 34, 0.15)',
              borderBottom: '1px solid rgba(210, 153, 34, 0.4)',
              color: '#f0883e',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '13px',
            }}
            data-testid="offline-restoration-conflict-banner"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={18} />
              <div>
                {draftRestorationUncertain ? (
                  <>
                    <strong>Preserved Offline Draft:</strong> An offline draft was found without a restoration baseline revision. It has been preserved so you can review it safely.
                  </>
                ) : (
                  <>
                    <strong>Shared Document Restored:</strong> This document was restored by another collaborator while you were disconnected. Your local offline draft has been preserved.
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: 'auto', padding: '4px 12px', fontSize: '12px', background: '#388bfd' }}
                onClick={() => setShowDraftModal(true)}
                data-testid="btn-view-offline-draft"
              >
                Review Offline Draft
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => {
                  setOfflineDraft(null);
                  try {
                    localStorage.removeItem(draftStorageKey);
                    localStorage.removeItem(baselineRevKey);
                  } catch (_e) {
                    // ignore localStorage error
                  }
                }}
                title="Dismiss"
                data-testid="btn-dismiss-draft-banner"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area: Document Workspace OR Project Board */}
        {activeNav === 'boards' ? (
          activeBoardId ? (
            <ProjectBoardView
              boardId={activeBoardId}
              workspaceId={currentWorkspace?.id || ''}
              isOwner={isOwner}
              isViewer={isViewer}
              members={workspaceMembers}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                gap: '12px',
                padding: '40px',
              }}
            >
              <Kanban size={48} style={{ opacity: 0.4 }} />
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>No Board Selected</h2>
              <p style={{ fontSize: '13px', maxWidth: '360px', textAlign: 'center' }}>
                Select an existing project board from the sidebar, or create a new board to start planning tasks.
              </p>
              {!isViewer && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: 'auto', marginTop: '8px' }}
                  onClick={() => setShowCreateBoardModal(true)}
                  data-testid="btn-create-first-board"
                >
                  <Plus size={15} style={{ marginRight: '6px' }} />
                  Create Board
                </button>
              )}
            </div>
          )
        ) : (
          /* Editor Area */
          <div className="editor-wrapper">
            <div className="editor-card">
              <div className="editor-header-bar">
                <h1 className="document-title" data-testid="document-heading">
                  {activeDocTitle}
                </h1>
                <p className="document-meta-subtitle">
                  {isViewer
                    ? 'You have Viewer access to this workspace. You can read the document, but modifications are restricted.'
                    : 'Write together. Changes appear for everyone in this document.'}
                </p>
              </div>

              {/* Document Formatting Toolbar */}
              {editor && !isViewer && (
                <div className="doc-formatting-toolbar" role="toolbar" aria-label="Formatting controls">
                  <div className="toolbar-group">
                    <button
                      type="button"
                      className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      title="Bold"
                      aria-label="Bold"
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      title="Italic"
                      aria-label="Italic"
                    >
                      <Italic size={14} />
                    </button>
                  </div>

                  <div className="toolbar-divider" />

                  <div className="toolbar-group">
                    <button
                      type="button"
                      className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                      title="Heading 1"
                      aria-label="Heading 1"
                    >
                      <Heading1 size={14} />
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                      title="Heading 2"
                      aria-label="Heading 2"
                    >
                      <Heading2 size={14} />
                    </button>
                  </div>

                  <div className="toolbar-divider" />

                  <div className="toolbar-group">
                    <button
                      type="button"
                      className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                      onClick={() => editor.chain().focus().toggleBulletList().run()}
                      title="Bullet List"
                      aria-label="Bullet List"
                    >
                      <List size={14} />
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                      onClick={() => editor.chain().focus().toggleOrderedList().run()}
                      title="Numbered List"
                      aria-label="Numbered List"
                    >
                      <ListOrdered size={14} />
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
                      onClick={() => editor.chain().focus().toggleBlockquote().run()}
                      title="Quote"
                      aria-label="Quote"
                    >
                      <Quote size={14} />
                    </button>
                  </div>

                  <div className="toolbar-divider" />

                  <div className="toolbar-group">
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => editor.chain().focus().undo().run()}
                      disabled={!editor.can().undo()}
                      title="Undo"
                      aria-label="Undo"
                    >
                      <Undo size={14} />
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => editor.chain().focus().redo().run()}
                      disabled={!editor.can().redo()}
                      title="Redo"
                      aria-label="Redo"
                    >
                      <Redo size={14} />
                    </button>
                  </div>
                </div>
              )}

              <div className="editor-body">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create Workspace Modal */}
      {showCreateWsModal && (
        <div className="modal-overlay" data-testid="create-workspace-modal">
          <div className="modal-card">
            <h2 className="modal-title">Create Workspace</h2>
            <p className="modal-desc">Create a private workspace to organize documents and collaborate with team members.</p>
            <form onSubmit={handleCreateWsSubmit}>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Engineering, Marketing"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                autoFocus
                required
                data-testid="input-new-workspace-name"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateWsModal(false)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: 'auto' }}
                  disabled={!newWsName.trim()}
                  data-testid="btn-submit-create-workspace"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Document Modal */}
      {showCreateDocModal && (
        <div className="modal-overlay" data-testid="create-document-modal">
          <div className="modal-card">
            <h2 className="modal-title">New Document</h2>
            <p className="modal-desc">Create a collaborative document inside {currentWorkspace?.name}.</p>
            <form onSubmit={handleCreateDocSubmit}>
              <input
                type="text"
                className="input-field"
                placeholder="Document Title"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                autoFocus
                required
                data-testid="input-new-doc-title"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateDocModal(false)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: 'auto' }}
                  disabled={!newDocTitle.trim()}
                  data-testid="btn-submit-create-doc"
                >
                  Create Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Board Modal */}
      {showCreateBoardModal && (
        <div className="modal-overlay" data-testid="create-board-modal">
          <div className="modal-card">
            <h2 className="modal-title">New Project Board</h2>
            <p className="modal-desc">Create a Kanban board inside {currentWorkspace?.name}. It will start with To Do, In Progress, and Done.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newBoardTitle.trim()) return;
                if (onCreateBoard) onCreateBoard(newBoardTitle.trim());
                setNewBoardTitle('');
                setShowCreateBoardModal(false);
              }}
            >
              <input
                type="text"
                className="input-field"
                placeholder="Board Title (e.g. Sprint 1, Product Roadmap)"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                autoFocus
                required
                data-testid="input-new-board-title"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateBoardModal(false)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: 'auto' }}
                  disabled={!newBoardTitle.trim()}
                  data-testid="btn-submit-create-board"
                >
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && currentWorkspace && isOwner && (
        <MembersModal
          workspaceId={currentWorkspace.id}
          workspaceName={currentWorkspace.name}
          currentUserId={user.id}
          onClose={() => setShowMembersModal(false)}
        />
      )}

      {/* Document Version History Modal */}
      {showHistoryModal && activeDocumentId && (
        <DocumentHistoryModal
          documentId={activeDocumentId}
          documentTitle={activeDocTitle}
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          isViewer={isViewer}
          onVersionRestored={() => {
            // Live Y.Doc updates automatically across provider and editor!
          }}
        />
      )}

      {/* Recoverable Offline Draft Review Modal */}
      {showDraftModal && offlineDraft && (
        <div className="modal-overlay" data-testid="offline-draft-modal">
          <div className="modal-card" style={{ maxWidth: '640px', width: '90%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#f0883e" />
                <h2 className="modal-title" style={{ margin: 0 }}>Recoverable Offline Draft</h2>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowDraftModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                data-testid="btn-close-draft-modal"
              >
                <X size={18} />
              </button>
            </div>
            <p className="modal-desc">
              {draftRestorationUncertain
                ? 'Your offline draft was preserved. Because this draft was recorded prior to authoritative revision cursor tracking, restoration status is uncertain. You can inspect or copy your text below.'
                : 'While you were disconnected, another collaborator restored this document to an earlier historical version. Your local offline edits have been preserved below so you can inspect, copy, or export them without losing your uncommitted text.'}
            </p>
            <div
              style={{
                backgroundColor: 'rgba(56, 139, 253, 0.1)',
                border: '1px solid rgba(56, 139, 253, 0.3)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                color: '#58a6ff',
                marginBottom: '12px',
              }}
              data-testid="draft-fidelity-notice"
            >
              <strong>Recovery Fidelity Notice:</strong> The recoverable draft preserves the latest plain-text content of your document. Formatting-only changes (such as bold or italic marks) on paragraphs that were replaced by the restoration are not reconstructed.
            </div>

            <div
              style={{
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '8px',
                padding: '16px',
                maxHeight: '300px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#c9d1d9',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginBottom: '16px',
              }}
              data-testid="offline-draft-content"
            >
              {offlineDraft}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={async () => {
                    await navigator.clipboard.writeText(offlineDraft);
                    setCopiedDraft(true);
                    setTimeout(() => setCopiedDraft(false), 2000);
                  }}
                  data-testid="btn-copy-draft"
                >
                  <Copy size={14} />
                  {copiedDraft ? 'Copied to Clipboard!' : 'Copy to Clipboard'}
                </button>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onClick={() => {
                    const blob = new Blob([offlineDraft], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${activeDocTitle || 'document'}-offline-draft.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="btn-export-draft"
                >
                  <Download size={14} />
                  Export as .txt
                </button>
              </div>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setShowDraftModal(false);
                  setOfflineDraft(null);
                  try {
                    localStorage.removeItem(draftStorageKey);
                    localStorage.removeItem(baselineRevKey);
                  } catch (_e) {
                    // ignore localStorage error
                  }
                }}
                data-testid="btn-done-draft"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
