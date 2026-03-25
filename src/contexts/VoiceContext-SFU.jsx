import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { Room, RoomEvent, Track } from 'livekit-client';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

const VoiceContext = createContext();

const base64UrlEncodeBytes = (bytes) => {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlEncodeJson = (value) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return base64UrlEncodeBytes(bytes);
};

const createHs256Jwt = async (payload, secret) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const message = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${message}.${encodedSignature}`;
};

/**
 * SFU (Selective Forwarding Unit) VoiceContext
 * 
 * Architecture: Each user connects to Livekit SFU server (1 connection per user)
 * - Sends: 1 audio stream (with RNNoise processing)
 * - Receives: N-1 audio streams (relayed from SFU)
 * 
 * Replaces old mesh RTC where each user had N-1 peer connections.
 */

export const VoiceProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [roomId, setRoomId] = useState(null);
  const [inRoom, setInRoom] = useState(false);
  
  // Livekit connection
  const roomRef = useRef(new Room());
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  
  // Audio processing
  const processorRef = useRef(null);
  const livekitUrlRef = useRef(import.meta.env.VITE_LIVEKIT_URL || '');
  
  // State
  const [micMuted, setMicMuted] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participantsMeta, setParticipantsMeta] = useState({});
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [userVolumes, setUserVolumes] = useState({});
  const [deviceSettings, setDeviceSettings] = useState({
    audioInput: 'default',
    audioOutput: 'default',
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    manualGain: 1.0,
    noiseThreshold: 0.5,
    useRNNoise: true
  });
  
  // Get access token from endpoint. Optional insecure fallback exists for temporary bring-up.
  const getAccessToken = useCallback(async (roomId, userId) => {
    const identity = String(currentUser?.uid || userId || 'anonymous');
    const displayName = currentUser?.displayName || currentUser?.email || 'User';
    const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT;

    try {
      if (tokenEndpoint) {
        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, userId, identity, displayName })
        });

        if (!response.ok) {
          throw new Error(`Token endpoint failed: ${response.status}`);
        }

        const data = await response.json();
        if (!data?.token) {
          throw new Error('Token endpoint returned no token');
        }

        if (data.url) {
          livekitUrlRef.current = data.url;
        }

        return data.token;
      }

      if (import.meta.env.VITE_ALLOW_INSECURE_CLIENT_TOKEN !== 'true') {
        throw new Error('VITE_LIVEKIT_TOKEN_ENDPOINT is not set and insecure fallback is disabled');
      }

      const apiKey = import.meta.env.VITE_LIVEKIT_API_KEY;
      const apiSecret = import.meta.env.VITE_LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        throw new Error('Missing VITE_LIVEKIT_API_KEY / VITE_LIVEKIT_API_SECRET for insecure fallback');
      }

      const now = Math.floor(Date.now() / 1000);
      const token = await createHs256Jwt(
        {
          iss: apiKey,
          sub: String(identity),
          name: String(displayName),
          iat: now,
          nbf: now - 1,
          exp: now + 60 * 60 * 12,
          video: {
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true
          },
          metadata: JSON.stringify({ userId, identity, displayName })
        },
        apiSecret
      );
      return token;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  }, [currentUser]);

  // Initialize audio processing (same as mesh version)
  const setupAudioProcessing = useCallback(async (stream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const ac = audioContextRef.current;
    
    // Create source from user media
    const source = ac.createMediaStreamSource(stream);
    
    // Setup RNNoise processor
    if (deviceSettings.useRNNoise) {
      try {
        // Load worklet
        await ac.audioWorklet.addModule('/rnnoise-processor.js');
        processorRef.current = new AudioWorkletNode(ac, 'rnnoise-processor');
        source.connect(processorRef.current);
        processorRef.current.connect(ac.destination);
      } catch (error) {
        console.error('RNNoise loading failed, using compressor:', error);
        // Fallback to compressor
        const compressor = ac.createDynamicsCompressor();
        source.connect(compressor);
        compressor.connect(ac.destination);
      }
    } else {
      // Direct connection with compressor
      const compressor = ac.createDynamicsCompressor();
      source.connect(compressor);
      compressor.connect(ac.destination);
    }
    
    return stream;
  }, [deviceSettings.useRNNoise]);

  // Join room via Livekit SFU
  const joinRoom = useCallback(async (newRoomId) => {
    if (!currentUser || inRoom) return;
    
    try {
      setRoomId(newRoomId);
      
      // 1. Get local audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceSettings.audioInput,
          noiseSuppression: deviceSettings.noiseSuppression,
          echoCancellation: deviceSettings.echoCancellation,
          autoGainControl: deviceSettings.autoGainControl
        },
        video: false
      });
      
      localStreamRef.current = stream;
      
      // 2. Process audio through RNNoise
      await setupAudioProcessing(stream);
      
      // 3. Get Livekit access token from Cloud Function
      const token = await getAccessToken(newRoomId, currentUser.uid);
      
      // 4. Connect to Livekit SFU
      const livekitUrl = livekitUrlRef.current || import.meta.env.VITE_LIVEKIT_URL;
      
      if (!livekitUrl) {
        console.error('VITE_LIVEKIT_URL not set. Check .env.local');
        throw new Error('SFU URL not configured');
      }
      
      // Create a fresh Room instance for this connection
      const room = new Room();
      roomRef.current = room;
      
      room.on(RoomEvent.Connected, () => {
        console.log('✓ Connected to SFU');
        setInRoom(true);
        
        // Add already-connected participants to state (for users joining after others)
        // room.participants is a Map<string, RemoteParticipant> - does NOT include local user
        if (room.participants && room.participants.size > 0) {
          const existingParticipants = Array.from(room.participants.values());
          console.log('Existing remote participants:', existingParticipants.map(p => ({ identity: p.identity, name: p.name })));
          
          existingParticipants.forEach(participant => {
            console.log(`Adding existing participant: ${participant.identity}`);
            // Add to participantsMeta so they show in VoiceRoom
            setParticipantsMeta(prev => ({
              ...prev,
              [participant.identity]: {
                uid: participant.identity,
                displayName: participant.name || participant.identity,
                joinedAt: new Date()
              }
            }));
            
            // Subscribe to their audio tracks
            if (participant.audioTracks && participant.audioTracks.size > 0) {
              participant.audioTracks.forEach(audioPublication => {
                if (!audioPublication.isSubscribed) {
                  console.log(`Subscribing to ${participant.identity}'s audio`);
                  audioPublication.setSubscribed(true);
                }
              });
            }
          });
        } else {
          console.log('No existing remote participants');
        }
      });
      
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log(`✓ ${participant.identity} joined`);
        
        // Subscribe to audio if available
        if (participant.audioTracks?.size > 0) {
          participant.audioTracks.forEach(pub => {
            if (!pub.isSubscribed) pub.setSubscribed(true);
          });
        }
        
        setParticipantsMeta(prev => ({
          ...prev,
          [participant.identity]: {
            uid: participant.identity,
            displayName: participant.name || participant.identity,
            joinedAt: new Date()
          }
        }));
      });
      
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log(`✗ ${participant.identity} left`);
        setParticipantsMeta(prev => {
          const updated = { ...prev };
          delete updated[participant.identity];
          return updated;
        });
        setRemoteStreams(prev => {
          const updated = { ...prev };
          delete updated[participant.identity];
          return updated;
        });
      });
      
      // Subscribe to remote audio tracks
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          // Ensure participant is in participantsMeta (in case ParticipantConnected didn't fire)
          setParticipantsMeta(prev => {
            if (!prev[participant.identity]) {
              return {
                ...prev,
                [participant.identity]: {
                  uid: participant.identity,
                  displayName: participant.name || participant.identity,
                  joinedAt: new Date()
                }
              };
            }
            return prev;
          });
          
          const audioElements = document.getElementsByTagName('audio');
          let audioElement = null;
          
          for (let element of audioElements) {
            if (element.dataset.participantId === participant.identity) {
              audioElement = element;
              break;
            }
          }
          
          if (!audioElement) {
            audioElement = document.createElement('audio');
            audioElement.dataset.participantId = participant.identity;
            audioElement.autoplay = true;
            audioElement.playsInline = true;
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);
          }
          
          audioElement.srcObject = new MediaStream([track.mediaStreamTrack]);
          audioElement.volume = userVolumes[participant.identity] ?? 1;
          
          // Store for state
          setRemoteStreams(prev => ({
            ...prev,
            [participant.identity]: new MediaStream([track.mediaStreamTrack])
          }));
        }
      });
      
      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          setRemoteStreams(prev => {
            const updated = { ...prev };
            delete updated[participant.identity];
            return updated;
          });
        }
      });
      
      // Add LOCAL user to participantsMeta BEFORE connecting
      // This way, when other users join, they immediately see YOU
      const identity = String(currentUser?.uid || 'anonymous');
      const displayName = currentUser?.displayName || currentUser?.email || 'User';
      setParticipantsMeta(prev => ({
        ...prev,
        [identity]: {
          uid: identity,
          displayName,
          joinedAt: new Date()
        }
      }));
      
      // Connect
      await room.connect(livekitUrl, token);
      
      // Publish local audio track
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, {
          simulcast: false
        });
      }
      
      // Write local user to Firestore so sidebar sees current room presence.
      const myParticipantRef = doc(db, 'rooms', newRoomId, 'participants', identity);
      await setDoc(myParticipantRef, {
        uid: identity,
        displayName,
        joinedAt: new Date().toISOString()
      }).catch(err => console.error('Error writing self to Firestore:', err));
      
      console.log('✓ Room joined and publishing audio');
      
    } catch (error) {
      console.error('Error joining room:', error);
      setInRoom(false);
      setRoomId(null);
    }
  }, [currentUser, inRoom, deviceSettings, setupAudioProcessing, getAccessToken, userVolumes]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    try {
      const room = roomRef.current;
      await room.disconnect();
      
      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      // Close audio context
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      // Remove from Firestore
      if (roomId && currentUser) {
        const identity = String(currentUser?.uid || 'anonymous');
        const myParticipantRef = doc(db, 'rooms', roomId, 'participants', identity);
        await deleteDoc(myParticipantRef).catch(err => console.error('Error removing self from Firestore:', err));
      }
      
      setInRoom(false);
      setRoomId(null);
      setRemoteStreams({});
      setParticipantsMeta({});
      
      console.log('✓ Left room');
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }, [roomId, currentUser]);

  const toggleMute = useCallback(async () => {
    if (roomRef.current && roomRef.current.localParticipant) {
      const publication = roomRef.current.localParticipant.audioTrackPublications.values().next().value;
      const track = publication?.track;
      if (!track) return;

      if (micMuted) {
        await track.unmute();
        setMicMuted(false);
      } else {
        await track.mute();
        setMicMuted(true);
      }
    }
  }, [micMuted]);

  const toggleScreenShare = useCallback(async () => {
    try {
      const room = roomRef.current;
      if (!room) return;
      
      if (isScreenSharing) {
        const pub = room.localParticipant.videoTrackPublications.values().next().value;
        if (pub?.track) {
          await room.localParticipant.unpublishTrack(pub.track);
        }
        setIsScreenSharing(false);
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        await room.localParticipant.publishTrack(screenTrack);
        screenTrack.onended = () => {
          setIsScreenSharing(false);
        };
        setIsScreenSharing(true);
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  }, [isScreenSharing]);

  // Cleanup on browser close/tab unload
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (inRoom) {
        // Fire and forget - browser doesn't wait for async
        try {
          const room = roomRef.current;
          if (room) await room.disconnect();
          if (roomId && currentUser) {
            const identity = String(currentUser?.uid || 'anonymous');
            const myParticipantRef = doc(db, 'rooms', roomId, 'participants', identity);
            await deleteDoc(myParticipantRef).catch(() => {});
          }
        } catch (e) {
          console.error('Error during unload cleanup:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [inRoom, roomId, currentUser]);

  return (
    <VoiceContext.Provider value={{
      roomId,
      localStream: localStreamRef.current,
      remoteStreams,
      participantsMeta,
      inRoom,
      joinRoom,
      leaveRoom,
      micMuted,
      toggleMute,
      userVolumes,
      setUserVolumes,
      deviceSettings,
      setDeviceSettings,
      isScreenSharing,
      toggleScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within VoiceProvider');
  }
  return context;
};
