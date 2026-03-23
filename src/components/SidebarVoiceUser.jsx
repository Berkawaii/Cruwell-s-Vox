import { useSpeaking } from '../hooks/useSpeaking';
import { MicOff } from 'lucide-react';

export default function SidebarVoiceUser({ meta, stream }) {
  const isSpeaking = useSpeaking(stream, 10); // 10 is a sensitive threshold to guarantee pickup

  return (
    <div className="sidebar-voice-user">
      <div className="sidebar-voice-user-left">
        <img 
          src={meta?.photoURL} 
          className={`avatar-small ${isSpeaking ? 'speaking' : ''}`} 
          alt={meta?.displayName || 'User'} 
        />
        <span>{meta?.displayName}</span>
      </div>
      {meta?.isMuted && <MicOff size={14} className="muted-icon" style={{ color: 'var(--danger)', opacity: 0.8 }} />}
    </div>
  );
}
