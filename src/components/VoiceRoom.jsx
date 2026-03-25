import { useAuth } from '../contexts/AuthContext';
import { useVoice } from '../contexts/VoiceContext';
import VoiceParticipant from './VoiceParticipant';
import { Volume2 } from 'lucide-react';
import './VoiceRoom.css';

export default function VoiceRoom({ roomName }) {
  const { currentUser } = useAuth();
  const { localStream, remoteStreams, participantsMeta, inRoom, micMuted, userVolumes, setParticipantVolume, isScreenSharing } = useVoice();

  return (
    <main className="main-content">
      <header className="content-header">
        <div className="header-title" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <Volume2 size={20} className="hash" /> {roomName}
        </div>
      </header>

      <div className="voice-area glass-panel">
        {!inRoom ? (
          <div className="join-voice-container animate-fade-in" style={{opacity: 0}}>
            Connecting...
          </div>
        ) : (
          <div className="active-voice-container animate-fade-in" style={{padding: '0'}}>
            <div className="voice-grid">
              
              {/* Local User */}
              <div className={`remote-participant-wrapper ${isScreenSharing ? 'screen-sharing-wrapper' : ''}`}>
                <VoiceParticipant 
                   meta={{ 
                     displayName: currentUser.displayName || 'You', 
                     isScreenSharing
                   }} 
                   stream={localStream} 
                   isLocal={true} 
                   micMuted={micMuted}
                />
              </div>

              {/* Remote Users — shown immediately from Firestore, stream attached when ready */}
              {Object.entries(participantsMeta)
                .filter(([uid]) => uid !== currentUser.uid)
                .map(([uid, meta]) => {
                  const stream = remoteStreams[uid] || null;
                  const userVol = userVolumes[uid] !== undefined ? userVolumes[uid] : 1;
                  
                  return (
                    <div key={uid} className={`remote-participant-wrapper ${meta.isScreenSharing ? 'screen-sharing-wrapper' : ''}`}>
                      <VoiceParticipant 
                         meta={meta} 
                         stream={stream} 
                         isLocal={false} 
                      />
                      <div className="user-volume-control">
                        <Volume2 size={14} color="var(--text-muted)"/>
                        <input 
                           type="range" 
                           min="0" max="1" step="0.01" 
                           value={userVol} 
                           onChange={(e) => setParticipantVolume(uid, parseFloat(e.target.value))}
                           className="volume-slider"
                           title="Participant Volume"
                        />
                      </div>
                    </div>
                  );
                })}

            </div>
          </div>
        )}
      </div>
    </main>
  );
}
