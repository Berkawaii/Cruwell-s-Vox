import { useState } from 'react';
import { X, Hash, Volume2, Edit2 } from 'lucide-react';

export default function ChannelModal({ onClose, onCreate, onEdit, channelToEdit = null, defaultType = 'text' }) {
  const [name, setName] = useState(channelToEdit ? channelToEdit.name : '');
  const [type, setType] = useState(channelToEdit ? channelToEdit.type : defaultType);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    if (channelToEdit) {
      onEdit(channelToEdit.id, name);
    } else {
      onCreate(name, type);
    }
    onClose();
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 11000 }}>
      <div className="modal-content glass-panel" style={{ maxWidth: '400px' }}>
        <button className="modal-close" onClick={onClose} type="button"><X size={20} /></button>
        
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            {channelToEdit ? <Edit2 size={24} /> : (type === 'text' ? <Hash size={24} /> : <Volume2 size={24} />)}
            {channelToEdit ? 'Edit Channel' : `Create ${type === 'text' ? 'Text' : 'Voice'} Channel`}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {!channelToEdit && (
            <div className="invite-field">
              <label className="label-text" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>CHANNEL TYPE</label>
              <div style={{display: 'flex', gap: '16px', marginTop: '12px'}}>
                 <label style={{display: 'flex', gap: '6px', alignItems:'center', cursor: 'pointer', color: type === 'text' ? 'var(--text-normal)' : 'var(--text-muted)'}}>
                    <input type="radio" checked={type === 'text'} onChange={() => setType('text')} /> Text Channel
                 </label>
                 <label style={{display: 'flex', gap: '6px', alignItems:'center', cursor: 'pointer', color: type === 'voice' ? 'var(--text-normal)' : 'var(--text-muted)'}}>
                    <input type="radio" checked={type === 'voice'} onChange={() => setType('voice')} /> Voice Channel
                 </label>
              </div>
            </div>
          )}

          <div className="invite-field">
            <label className="label-text" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>CHANNEL NAME</label>
            <input 
              type="text" 
              className="input-base" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. general"
              autoFocus
              style={{marginTop: '8px', width: '100%', boxSizing: 'border-box'}}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button type="button" className="btn btn-kinetic-secondary" onClick={onClose} style={{padding: '8px 16px', minWidth: '80px'}}>Cancel</button>
            <button type="submit" className="btn btn-kinetic-primary" style={{padding: '8px 16px', minWidth: '120px'}}>
              {channelToEdit ? 'Save Changes' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
