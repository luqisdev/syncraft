import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import {
  CollaborativeEditor,
  WorkspaceSummary,
  DocumentSummary,
} from './CollaborativeEditor';
import { getRandomColor } from './utils';

function MainApp() {
  const { user, loading, logout } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceSummary | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>('');
  const [boards, setBoards] = useState<any[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [activeNav, setActiveNav] = useState<'docs' | 'boards'>('docs');
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [userColor] = useState<string>(() => getRandomColor());

  // WebSocket Server URL: Use configured VITE_SERVER_URL or direct backend on 1234
  const serverUrl = import.meta.env.VITE_SERVER_URL || 'ws://127.0.0.1:1234';

  // Fetch workspaces when user is authenticated
  const fetchWorkspaces = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/workspaces', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const wsList: WorkspaceSummary[] = data.workspaces || [];
        setWorkspaces(wsList);
        if (wsList.length > 0) {
          // Keep current or select first
          setCurrentWorkspace((prev) => {
            if (prev && wsList.some((w) => w.id === prev.id)) {
              return wsList.find((w) => w.id === prev.id) || wsList[0];
            }
            return wsList[0];
          });
        } else {
          setCurrentWorkspace(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchWorkspaces();
    } else {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setDocuments([]);
      setActiveDocId('');
      setBoards([]);
      setActiveBoardId('');
      setWorkspaceMembers([]);
    }
  }, [user]);

  // Fetch documents, boards, and members when currentWorkspace changes
  const fetchDocuments = async (wsId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/documents`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const docs: DocumentSummary[] = data.documents || [];
        setDocuments(docs);
        if (docs.length > 0) {
          setActiveDocId((prev) => {
            if (prev && docs.some((d) => d.id === prev)) {
              return prev;
            }
            return docs[0].id;
          });
        } else {
          setActiveDocId('');
        }
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchBoards = async (wsId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/boards`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const boardList = data.boards || [];
        setBoards(boardList);
        if (boardList.length > 0) {
          setActiveBoardId((prev) => {
            if (prev && boardList.some((b: any) => b.id === prev)) {
              return prev;
            }
            return boardList[0].id;
          });
        } else {
          setActiveBoardId('');
        }
      }
    } catch (err) {
      console.error('Failed to fetch boards:', err);
    }
  };

  const fetchMembers = async (wsId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/members`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaceMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  };

  useEffect(() => {
    if (currentWorkspace) {
      fetchDocuments(currentWorkspace.id);
      fetchBoards(currentWorkspace.id);
      fetchMembers(currentWorkspace.id);
    }
  }, [currentWorkspace?.id]);

  const handleSelectWorkspace = async (wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) {
      setCurrentWorkspace(ws);
      fetchDocuments(wsId);
      fetchBoards(wsId);
      fetchMembers(wsId);
    }
  };

  const handleCreateBoard = async (title: string) => {
    if (!currentWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchBoards(currentWorkspace.id);
        if (data.board?.id) {
          setActiveBoardId(data.board.id);
          setActiveNav('boards');
        }
      }
    } catch (err) {
      console.error('Failed to create board:', err);
    }
  };

  const handleCreateWorkspace = async (name: string) => {
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchWorkspaces();
        if (data.workspace) {
          setCurrentWorkspace({
            id: data.workspace.id,
            name: data.workspace.name,
            created_by: data.workspace.created_by,
            role: 'owner',
          });
        }
      }
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  };

  const handleCreateDoc = async (title: string) => {
    if (!currentWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchDocuments(currentWorkspace.id);
        if (data.document?.id) {
          setActiveDocId(data.document.id);
        }
      }
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  };

  const handleRenameDoc = async (docId: string, newTitle: string) => {
    if (!currentWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/documents/${docId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === docId ? { ...d, title: newTitle } : d))
        );
      }
    } catch (err) {
      console.error('Failed to rename document:', err);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-muted)',
          fontSize: '14px',
        }}
      >
        Initializing Syncraft...
      </div>
    );
  }

  if (!user) {
    return <AuthModal onSuccess={fetchWorkspaces} />;
  }

  return (
    <CollaborativeEditor
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        color: userColor,
        sessionId: user.sessionId,
      }}
      workspaces={workspaces}
      currentWorkspace={currentWorkspace}
      documents={documents}
      activeDocumentId={activeDocId}
      boards={boards}
      activeBoardId={activeBoardId}
      activeNav={activeNav}
      workspaceMembers={workspaceMembers}
      serverUrl={serverUrl}
      onSelectWorkspace={handleSelectWorkspace}
      onCreateWorkspace={handleCreateWorkspace}
      onSelectDoc={(id) => {
        setActiveDocId(id);
        setActiveNav('docs');
      }}
      onCreateDoc={handleCreateDoc}
      onRenameDoc={handleRenameDoc}
      onSelectBoard={(id) => {
        setActiveBoardId(id);
        setActiveNav('boards');
      }}
      onCreateBoard={handleCreateBoard}
      onSelectNav={(nav) => setActiveNav(nav)}
      onLogout={logout}
    />
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
