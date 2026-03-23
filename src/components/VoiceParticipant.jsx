import { useEffect, useRef } from 'react';
import { useSpeaking } from '../hooks/useSpeaking';
import { MicOff } from 'lucide-react';

export default function VoiceParticipant({ meta, stream, isLocal, micMuted }) {
  const isSpeaking = useSpeaking(stream, 10);
  const videoRef = useRef(null);

  useEffect(() => {
    if (meta?.isScreenSharing && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [meta?.isScreenSharing, stream]);

  return (
    <div className={`voice-participant ${isLocal ? '' : 'remote'} ${meta?.isScreenSharing ? 'screen-sharing' : ''}`}>
      {meta?.isScreenSharing ? (
        <div className="video-container">
          <video ref={videoRef} autoPlay playsInline muted={isLocal} className="screen-video" />
          <div className="video-overlay-name">{meta.displayName} {isLocal && '(You)'}</div>
        </div>
      ) : (
        <>
          <img 
            src={meta?.photoURL} 
            className={`voice-avatar ${isSpeaking ? 'speaking' : ''}`} 
            alt={meta?.displayName || 'User'} 
          />
          <div className="voice-name">{meta?.displayName} {isLocal && '(You)'}</div>
        </>
      )}
      
      {isLocal && micMuted && <div className="mute-indicator"><MicOff size={16} color="white"/></div>}
    </div>
  );
}
