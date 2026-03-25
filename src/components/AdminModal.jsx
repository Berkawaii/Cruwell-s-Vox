import { X, ShieldAlert, UserCog, UserMinus, UserCheck, Crown } from 'lucide-react';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import './AdminModal.css';

export default function AdminModal({ onClose }) {
  const { users, updateUserRole, loading } = useUsers();
  const { currentUser } = useAuth();

  const handleRoleChange = (userId, newRole) => {
    // Prevent self-demotion or self-ban easily if needed
    if (userId === currentUser.uid && newRole !== 'admin') {
      const confirmSelf = window.confirm("Are you sure you want to remove your own admin privileges? You won't be able to undo this.");
      if (!confirmSelf) return;
    }
    updateUserRole(userId, newRole);
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-content glass-panel" style={{ maxWidth: '600px' }}>
        <button className="modal-close" onClick={onClose}><X size={20} /></button>
        
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
            <ShieldAlert size={24} /> Admin Access Panel
          </h2>
          <p className="modal-subtitle">Manage server members, assign roles, or restrict access.</p>
        </div>

        <div className="modal-body admin-body">
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading users...</p>
          ) : (
            <div className="admin-user-list">
              {users.map(user => (
                (() => {
                  const displayName = typeof user.displayName === 'string' && user.displayName.trim() ? user.displayName.trim() : 'User';
                  const initial = displayName.charAt(0).toUpperCase();
                  const avatarColor = `hsl(${displayName.charCodeAt(0) * 12 % 360}, 70%, 60%)`;
                  return (
                <div key={user.id} className="admin-user-row">
                  <div className="admin-user-avatar" style={{
                    background: avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    color: 'white',
                    fontSize: '14px'
                  }}>
                    {initial}
                  </div>
                  <div className="admin-user-info">
                    <span className="admin-user-name">
                      {displayName} {user.id === currentUser.uid && "(You)"}
                    </span>
                    <span className={`admin-user-role role-${user.role}`}>
                      {user.role}
                    </span>
                  </div>

                  <div className="admin-actions">
                    {user.role !== 'admin' && user.role !== 'banned' && (
                      <button 
                        className="btn btn-kinetic-secondary admin-btn" 
                        title="Promote to Admin"
                        onClick={() => handleRoleChange(user.id, 'admin')}
                      >
                        <Crown size={16} /> Promote
                      </button>
                    )}
                    
                    {user.role === 'admin' && (
                      <button 
                        className="btn btn-kinetic-secondary admin-btn" 
                        title="Demote to Member"
                        onClick={() => handleRoleChange(user.id, 'member')}
                      >
                        <UserCog size={16} /> Demote
                      </button>
                    )}

                    {user.role !== 'banned' ? (
                      <button 
                        className="btn btn-danger admin-btn" 
                        title="Ban User"
                        onClick={() => handleRoleChange(user.id, 'banned')}
                      >
                        <UserMinus size={16} /> Ban
                      </button>
                    ) : (
                      <button 
                        className="btn btn-kinetic-primary admin-btn" 
                        title="Unban User"
                        onClick={() => handleRoleChange(user.id, 'member')}
                      >
                        <UserCheck size={16} /> Unban
                      </button>
                    )}
                  </div>
                </div>
                  );
                })()
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
