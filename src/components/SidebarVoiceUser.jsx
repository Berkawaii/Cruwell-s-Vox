import { useSpeaking } from '../hooks/useSpeaking';
import { MicOff } from 'lucide-react';

export default function SidebarVoiceUser({ meta, stream }) {
  const isSpeaking = useSpeaking(stream, 10); // 10 is a sensitive threshold to guarantee pickup

  return (
    <div className="sidebar-voice-user">
      <div className="sidebar-voice-user-left">
        <div 
          className={`avatar-small ${isSpeaking ? 'speaking' : ''}`}
          style={{
            background: `hsl(${meta?.displayName?.charCodeAt(0) * 12 % 360}, 70%, 60%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: 'white',
            fontSize: '12px'
          }}
        >
          {meta?.displayName?.charAt(0).toUpperCase()}
        </div>
        <span>{meta?.displayName}</span>
      </div>
      {meta?.isMuted && <MicOff size={14} className="muted-icon" style={{ color: 'var(--danger)', opacity: 0.8 }} />}
    </div>
  );
}
