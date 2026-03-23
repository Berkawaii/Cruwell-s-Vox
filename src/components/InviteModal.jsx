import { useState } from 'react';
import { Copy, Check, X, Users, Edit2, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useServerPassword } from '../hooks/useServerPassword';
import './InviteModal.css';

export default function InviteModal({ onClose }) {
  const { currentUserProfile } = useAuth();
  const { serverPassword, updatePassword, loading } = useServerPassword();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editPass, setEditPass] = useState("");
  
  const serverLink = window.location.origin;

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      if (editPass.trim() && editPass !== serverPassword) {
        updatePassword(editPass);
      }
      setIsEditing(false);
    } else {
      setEditPass(serverPassword);
      setIsEditing(true);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-content glass-panel" style={{ maxWidth: '400px' }}>
        <button className="modal-close" onClick={onClose}><X size={20} /></button>
        
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <Users size={24} /> Invite Friends
          </h2>
          <p className="modal-subtitle">Share this info with your friends to grant them access to Cruwell's Vox.</p>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="invite-field">
            <label className="label-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SERVER LINK</label>
            <div className="invite-input-row">
              <input type="text" className="input-base" value={serverLink} readOnly />
              <button 
                className={`btn ${copiedLink ? 'btn-kinetic-primary' : 'btn-kinetic-secondary'}`} 
                onClick={() => handleCopy(serverLink, 'link')}
                style={{ padding: '8px 12px', minWidth: '80px' }}
              >
                {copiedLink ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <div className="invite-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="label-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SERVER PASSWORD</label>
              {currentUserProfile?.role === 'admin' && (
                <button 
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                  onClick={handleEditToggle}
                >
                  {isEditing ? <><Save size={14}/> Save</> : <><Edit2 size={14}/> Edit</>}
                </button>
              )}
            </div>
            <div className="invite-input-row">
              {isEditing ? (
                <input 
                  type="text" 
                  className="input-base" 
                  value={editPass} 
                  onChange={e => setEditPass(e.target.value)} 
                  autoFocus
                />
              ) : (
                <input type="text" className="input-base" value={loading ? "..." : serverPassword} readOnly />
              )}
              
              <button 
                className={`btn ${copiedPass ? 'btn-kinetic-primary' : 'btn-kinetic-secondary'}`} 
                onClick={() => handleCopy(serverPassword, 'pass')}
                style={{ padding: '8px 12px', minWidth: '80px' }}
                disabled={isEditing || loading}
              >
                {copiedPass ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
