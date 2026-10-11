import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2 } from 'lucide-react';

export interface Member {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  name: string;
  email: string;
  joined_at: string;
}

interface MembersModalProps {
  workspaceId: string;
  workspaceName: string;
  currentUserId: string;
  onClose: () => void;
}

export const MembersModal: React.FC<MembersModalProps> = ({
  workspaceId,
  workspaceName,
  currentUserId,
  onClose,
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to load workspace members');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [workspaceId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add member');
      } else {
        setSuccess(`User ${inviteEmail} added successfully as ${inviteRole}.`);
        setInviteEmail('');
        fetchMembers();
      }
    } catch (err: any) {
      setError(err.message || 'Error adding member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'owner' | 'editor' | 'viewer') => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update member role');
      } else {
        fetchMembers();
      }
    } catch (err: any) {
      setError(err.message || 'Error updating member role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to remove member');
      } else {
        fetchMembers();
      }
    } catch (err: any) {
      setError(err.message || 'Error removing member');
    }
  };

  return (
    <div className="modal-overlay" data-testid="members-modal">
      <div className="modal-card" style={{ maxWidth: '580px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 className="modal-title" style={{ margin: 0, fontSize: '18px' }}>
              Workspace Members
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Managing access for <strong>{workspaceName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
            data-testid="btn-close-members-modal"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(248, 81, 73, 0.15)',
              border: '1px solid rgba(248, 81, 73, 0.4)',
              color: 'var(--color-offline)',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '12px',
            }}
            data-testid="members-error"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(63, 185, 80, 0.15)',
              border: '1px solid rgba(63, 185, 80, 0.4)',
              color: 'var(--color-online)',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '12px',
            }}
            data-testid="members-success"
          >
            {success}
          </div>
        )}

        {/* Add Member Form */}
        <form onSubmit={handleAddMember} style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            Add Member by Email
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="email"
              className="input-field"
              style={{ marginBottom: 0, flex: 1 }}
              placeholder="Registered user email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              data-testid="input-member-email"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                borderRadius: '6px',
                padding: '0 10px',
                fontSize: '13px',
                outline: 'none',
              }}
              data-testid="select-member-role"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              className="btn-primary"
              style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px' }}
              disabled={submitting}
              data-testid="btn-add-member"
            >
              <UserPlus size={16} />
              Add
            </button>
          </div>
        </form>

        {/* Member List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            Current Members ({members.length})
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
              Loading members...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {members.map((member) => {
                const isCurrentUser = member.user_id === currentUserId;
                return (
                  <div
                    key={member.user_id}
                    data-testid={`member-row-${member.email}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                          {member.name}
                        </span>
                        {isCurrentUser && (
                          <span
                            style={{
                              fontSize: '10px',
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--text-muted)',
                              padding: '1px 6px',
                              borderRadius: '10px',
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{member.email}</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user_id, e.target.value as any)}
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          outline: 'none',
                        }}
                        data-testid={`select-role-${member.email}`}
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>

                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        title="Remove member"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-offline)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        data-testid={`btn-remove-${member.email}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
