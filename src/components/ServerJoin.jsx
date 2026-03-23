import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useServerPassword } from '../hooks/useServerPassword';
import './ServerJoin.css';

export default function ServerJoin({ onAccessGranted }) {
  const { currentUser, logout } = useAuth();
  const { serverPassword, loading } = useServerPassword();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    if (password === serverPassword) {
      setError("");
      onAccessGranted();
    } else {
      setError("Incorrect server password!");
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card glass-panel animate-fade-in" style={{ maxWidth: '400px' }}>
        <div className="login-logo-container">
          <div className="login-logo" style={{ width: '64px', height: '64px' }}>
            <Lock size={32} color="var(--secondary)" />
          </div>
          <h1 className="login-title">Private Server</h1>
          <p className="login-subtitle">
            Welcome, {currentUser.displayName}! Please enter the server password to join Cruwell's Vox.
          </p>
        </div>

        {error && <div className="login-error animate-fade-in">{error}</div>}

        <form onSubmit={handleSubmit} className="login-actions">
          <input 
            type="password" 
            className="input-base" 
            placeholder="Server Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginBottom: '8px' }}
            autoFocus
          />
          <button type="submit" className="btn btn-kinetic-primary login-btn" disabled={loading}>
            <span>{loading ? "Loading..." : "Join Server"}</span>
          </button>
        </form>

        <div className="login-divider" style={{ margin: '16px 0' }}>
          <span>or</span>
        </div>

        <button 
          type="button" 
          className="btn btn-kinetic-secondary login-btn" 
          onClick={logout}
        >
          <span>Sign out ({currentUser.email})</span>
        </button>
      </div>
    </div>
  );
}
