import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';
import './Login.css';

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    try {
      setError("");
      setLoading(true);
      await loginWithGoogle();
    } catch (err) {
      setError("Google authentication failed or was cancelled.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card glass-panel animate-fade-in">
        <div className="login-logo-container">
          <div className="login-logo">
            <img src="/logo.svg" alt="CruwellsVox" />
          </div>
          <h1 className="login-title">Welcome Back!</h1>
          <p className="login-subtitle">We're so excited to see you again.</p>
        </div>

        {error && <div className="login-error animate-fade-in">{error}</div>}

        <div className="login-actions">
          <button 
            className="btn btn-kinetic-primary login-btn" 
            onClick={handleGoogleLogin} 
            disabled={loading}
          >
            <LogIn size={20} />
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
