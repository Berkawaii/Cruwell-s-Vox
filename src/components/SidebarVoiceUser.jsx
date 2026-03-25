import { useSpeaking } from '../hooks/useSpeaking';
import { MicOff } from 'lucide-react';

export default function SidebarVoiceUser({ meta, stream }) {
  const isSpeaking = useSpeaking(stream, 10); // 10 is a sensitive threshold to guarantee pickup
  const displayName = typeof meta?.displayName === 'string' && meta.displayName.trim() ? meta.displayName.trim() : 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarColor = `hsl(${displayName.charCodeAt(0) * 12 % 360}, 70%, 60%)`;

  return (
    <div className="sidebar-voice-user">
      <div className="sidebar-voice-user-left">
        <div 
          className={`avatar-small ${isSpeaking ? 'speaking' : ''}`}
          style={{
            background: avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: 'white',
            fontSize: '12px'
          }}
        >
          {initial}
        </div>
        <span>{displayName}</span>
      </div>
      {meta?.isMuted && <MicOff size={14} className="muted-icon" style={{ color: 'var(--danger)', opacity: 0.8 }} />}
    </div>
  );
}
