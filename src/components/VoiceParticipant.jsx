import { useEffect, useRef } from 'react';
import { useSpeaking } from '../hooks/useSpeaking';
import { useVoice } from '../contexts/VoiceContext';
import { MicOff, Maximize } from 'lucide-react';

export default function VoiceParticipant({ meta, stream, isLocal, micMuted }) {
  const { screenStream } = useVoice();
  const isSpeaking = useSpeaking(stream, 10);
  const videoRef = useRef(null);

  const showVideo = meta?.isScreenSharing;

  useEffect(() => {
    if (!showVideo || !videoRef.current) return;

    if (isLocal && screenStream) {
      // For local user, use the actual screenStream for the video element
      videoRef.current.srcObject = screenStream;
    } else if (!isLocal && stream) {
      // For remote users, the video track is in the combined stream
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoRef.current.srcObject = new MediaStream(videoTracks);
      }
    }
  }, [showVideo, isLocal, screenStream, stream]);

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      } else if (videoRef.current.msRequestFullscreen) {
        videoRef.current.msRequestFullscreen();
      }
    }
  };

  return (
    <div className={`voice-participant ${isLocal ? '' : 'remote'} ${showVideo ? 'screen-sharing' : ''}`}>
      {showVideo ? (
        <div className="video-container">
          <video ref={videoRef} autoPlay playsInline muted className="screen-video" />
          <div className="video-overlay-name">{meta?.displayName} {isLocal && '(You)'}</div>
          <button className="fullscreen-btn" onClick={toggleFullscreen} title="Full Screen">
            <Maximize size={16} color="white" />
          </button>
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

      {(isLocal ? micMuted : meta?.isMuted) && (
        <div className="mute-indicator"><MicOff size={16} color="white" /></div>
      )}
    </div>
  );
}
