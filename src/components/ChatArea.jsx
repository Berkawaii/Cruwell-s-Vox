import { useState, useRef, useEffect } from 'react';
import { useMessages } from '../hooks/useMessages';
import { useAuth } from '../contexts/AuthContext';
import { Send, Hash, Trash2 } from 'lucide-react';
import './ChatArea.css';

export default function ChatArea({ roomId, roomName }) {
  const { currentUser, currentUserProfile } = useAuth();
  const { messages, loading, sendMessage, deleteMessage } = useMessages(roomId);
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    await sendMessage(text, currentUser);
    setText('');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <main className="main-content">
      <header className="content-header">
        <div className="header-title" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <Hash size={20} className="hash" /> {roomName}
        </div>
      </header>

      <div className="messages-area">
        {loading && <div className="loading-state">Loading messages...</div>}
        
        {!loading && messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-hash"><Hash size={48} /></div>
            <h2>Welcome to #{roomName}!</h2>
            <p>This is the start of the #{roomName} channel.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="message animate-fade-in">
            <div className="avatar" style={{
              background: `hsl(${msg.displayName.charCodeAt(0) * 12 % 360}, 70%, 60%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: 'white'
            }}>
              {msg.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="message-content">
              <div className="message-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="message-author">{msg.displayName}</span>
                  <span className="message-timestamp">{formatTime(msg.createdAt)}</span>
                </div>
                {(msg.uid === currentUser.uid || currentUserProfile?.role === 'admin') && (
                  <button 
                    className="delete-message-btn"
                    onClick={() => { if(window.confirm('Delete this message?')) deleteMessage(msg.id); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', display: 'flex' }}
                    title="Delete Message"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="message-body">{msg.text}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form onSubmit={handleSend} className="chat-input-wrapper">
          <input 
            type="text" 
            className="input-base" 
            placeholder={`Message #${roomName}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="send-btn" disabled={!text.trim()}>
            <Send size={18} />
          </button>
        </form>
      </div>
    </main>
  );
}
