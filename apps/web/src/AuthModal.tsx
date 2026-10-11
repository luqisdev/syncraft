import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { Layers } from 'lucide-react';

interface AuthModalProps {
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setError('Name is required.');
          setSubmitting(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setSubmitting(false);
          return;
        }
        const res = await register(name, email, password);
        if (!res.success) {
          setError(res.error || 'Failed to create account.');
        } else {
          onSuccess();
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          setError(res.error || 'Invalid email or password.');
        } else {
          onSuccess();
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="auth-modal">
      <div className="modal-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Layers style={{ color: 'var(--accent-blue)', width: '24px', height: '24px' }} />
          <h2 className="modal-title" style={{ margin: 0 }}>
            {isRegister ? 'Create your Syncraft Account' : 'Sign in to Syncraft'}
          </h2>
        </div>
        <p className="modal-desc">
          {isRegister
            ? 'Get started with private workspaces and authorized collaborative documents.'
            : 'Enter your credentials to access your private workspaces.'}
        </p>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(248, 81, 73, 0.15)',
              border: '1px solid rgba(248, 81, 73, 0.4)',
              color: 'var(--color-offline)',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
            data-testid="auth-error-message"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                }}
              >
                Full Name
              </label>
              <input
                type="text"
                className="input-field"
                style={{ marginBottom: 0 }}
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="input-register-name"
              />
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              className="input-field"
              style={{ marginBottom: 0 }}
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-auth-email"
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <input
              type="password"
              className="input-field"
              style={{ marginBottom: 0 }}
              placeholder={isRegister ? 'At least 6 characters' : 'Enter password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="input-auth-password"
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            data-testid="btn-auth-submit"
          >
            {submitting ? 'Please wait...' : isRegister ? 'Register' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-blue-hover)',
              cursor: 'pointer',
              fontWeight: 500,
              textDecoration: 'underline',
              padding: 0,
            }}
            data-testid="btn-toggle-auth-mode"
          >
            {isRegister ? 'Sign In' : 'Create one'}
          </button>
        </div>
      </div>
    </div>
  );
};
