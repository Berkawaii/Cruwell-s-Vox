import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, onSnapshot, updateDoc, deleteDoc, addDoc, getDocs } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const VoiceContext = createContext();

export function useVoice() {
  return useContext(VoiceContext);
}

const servers = {
  iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }]
};

export function VoiceProvider({ children }) {
  const { currentUser } = useAuth();
  const [roomId, setRoomId] = useState(null);
  // localStream = raw mic audio stream (for peer connections)
  // screenStream = display media stream
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participantsMeta, setParticipantsMeta] = useState({});
  const [inRoom, setInRoom] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [deviceSettings, setDeviceSettings] = useState({
    audioInput: 'default',
    audioOutput: 'default',
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    manualGain: 1.0,
    noiseThreshold: -50
  });
  const [userVolumes, setUserVolumes] = useState({});

  // Use refs for values needed inside long-lived callbacks
  const settingsRef = useRef(deviceSettings);
  const micMutedRef = useRef(false);
  const peerConnections = useRef({});
  const roomRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const gainNodeRef = useRef(null);
  const noiseGateRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const isRunningRef = useRef(false); // controls the RAF loop

  useEffect(() => { settingsRef.current = deviceSettings; }, [deviceSettings]);
  useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);

  const setParticipantVolume = (uid, volume) => {
    setUserVolumes(prev => ({ ...prev, [uid]: volume }));
  };

  const changeAudioSettings = async (key, value) => {
    setDeviceSettings(prev => ({ ...prev, [key]: value }));

    if (key === 'manualGain' && gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(value, audioCtxRef.current.currentTime, 0.1);
      return;
    }
    if (key === 'noiseThreshold') return;

    if (['audioInput', 'noiseSuppression', 'echoCancellation', 'autoGainControl'].includes(key) && inRoom && localStreamRef.current) {
      try {
        const s = settingsRef.current;
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: (key === 'audioInput' ? value : s.audioInput) !== 'default' ? { exact: key === 'audioInput' ? value : s.audioInput } : undefined,
            noiseSuppression: key === 'noiseSuppression' ? value : s.noiseSuppression,
            echoCancellation: key === 'echoCancellation' ? value : s.echoCancellation,
            autoGainControl: key === 'autoGainControl' ? value : s.autoGainControl,
          }
        });
        const newTrack = newStream.getAudioTracks()[0];
        newTrack.enabled = !micMutedRef.current;

        const oldTrack = localStreamRef.current.getAudioTracks()[0];
        if (oldTrack) { localStreamRef.current.removeTrack(oldTrack); oldTrack.stop(); }
        localStreamRef.current.addTrack(newTrack);

        // Re-pipe into AudioContext
        if (audioCtxRef.current && gainNodeRef.current) {
          const src = audioCtxRef.current.createMediaStreamSource(new MediaStream([newTrack]));
          src.connect(gainNodeRef.current);
        }

        Object.values(peerConnections.current).forEach(pc => {
          if (pc && typeof pc.getSenders === 'function') {
            const s = pc.getSenders().find(s => s.track?.kind === 'audio');
            if (s) s.replaceTrack(newTrack);
          }
        });
      } catch (e) { console.error('Failed to swap audio device', e); }
    }
  };

  const toggleScreenShare = async () => {
    if (!inRoom || !roomRef.current) return;

    if (isScreenSharing) {
      // Stop screen share
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      
      // Replace video track in all peers with null/empty
      Object.values(peerConnections.current).forEach(pc => {
        if (pc && typeof pc.getSenders === 'function') {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(null);
        }
      });

      await updateDoc(doc(roomRef.current, 'participants', currentUser.uid), { isScreenSharing: false }).catch(() => {});
    } else {
      try {
        const dispStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
        screenStreamRef.current = dispStream;
        setScreenStream(dispStream);
        setIsScreenSharing(true);

        const videoTrack = dispStream.getVideoTracks()[0];
        videoTrack.onended = () => {
          // User stopped via browser UI
          if (isRunningRef.current) toggleScreenShare();
        };

        // Send video track to all existing peers
        Object.values(peerConnections.current).forEach(pc => {
          if (pc && typeof pc.getSenders === 'function') {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            } else {
              // Add it if there's no video sender yet
              pc.addTrack(videoTrack, dispStream);
            }
          }
        });

        await updateDoc(doc(roomRef.current, 'participants', currentUser.uid), { isScreenSharing: true }).catch(() => {});
      } catch (e) { console.error('Screen share error', e); }
    }
  };

  const joinRoom = async (newRoomId) => {
    if (inRoom) await leaveRoom();
    if (!currentUser) return;

    try {
      setRoomId(newRoomId);
      roomRef.current = doc(db, 'webrtc_rooms', newRoomId);
      isRunningRef.current = true;

      const s = settingsRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: s.audioInput !== 'default' ? { exact: s.audioInput } : undefined,
          noiseSuppression: s.noiseSuppression,
          echoCancellation: s.echoCancellation,
          autoGainControl: s.autoGainControl,
        },
        video: false
      });

      localStreamRef.current = stream;

      // ─── AudioContext Pipeline ─────────────────────────────────────────
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtxRef.current.createMediaStreamSource(stream);

      const gainNode = audioCtxRef.current.createGain();
      gainNode.gain.value = s.manualGain;
      gainNodeRef.current = gainNode;

      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const noiseGate = audioCtxRef.current.createGain();
      noiseGate.gain.value = 1;
      noiseGateRef.current = noiseGate;

      const destination = audioCtxRef.current.createMediaStreamDestination();

      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(noiseGate);
      noiseGate.connect(destination);

      // Noise Gate RAF loop — checks micMutedRef to avoid overriding mute
      const processNoiseGate = () => {
        if (!isRunningRef.current || !audioCtxRef.current || !analyserRef.current || !noiseGateRef.current) return;

        // CRITICAL: if manually muted, always keep gate closed
        if (micMutedRef.current) {
          noiseGateRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.02);
          requestAnimationFrame(processNoiseGate);
          return;
        }

        const dataArray = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

        const threshold = settingsRef.current.noiseThreshold;
        if (db < threshold) {
          noiseGateRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
        } else {
          noiseGateRef.current.gain.setTargetAtTime(1, audioCtxRef.current.currentTime, 0.01);
        }
        requestAnimationFrame(processNoiseGate);
      };
      requestAnimationFrame(processNoiseGate);
      // ──────────────────────────────────────────────────────────────────

      // The stream we expose to React UI (for visualizer/loopback) is the processed one
      const processedStream = destination.stream;

      setLocalStream(processedStream);
      setInRoom(true);

      // Register self in Firestore
      const myParticipantRef = doc(roomRef.current, 'participants', currentUser.uid);
      await setDoc(myParticipantRef, {
        joinedAt: Date.now(),
        displayName: currentUser.displayName || 'Guest User',
        photoURL: currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || 'Guest'}&background=random`,
        isScreenSharing: false,
        isMuted: false
      });

      // Listen to all participants metadata
      const unsubParticipants = onSnapshot(collection(roomRef.current, 'participants'), (snap) => {
        const meta = {};
        snap.docs.forEach(d => { meta[d.id] = d.data(); });
        setParticipantsMeta(meta);
      });
      peerConnections.current['_unsubParticipants'] = unsubParticipants;

      // Listen for incoming offers (others calling us)
      const myConnectionsRef = collection(myParticipantRef, 'connections');
      const unsubIncoming = onSnapshot(myConnectionsRef, snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            // Pass the raw mic stream to peer connections; screen share is addTrack'd separately
            if (data.offer) handleIncomingOffer(change.doc.id, data.offer, stream);
          }
        });
      });
      peerConnections.current['_unsubIncoming'] = unsubIncoming;

      // Call everyone already in the room
      const participantsSnap = await getDocs(collection(roomRef.current, 'participants'));
      participantsSnap.forEach(pDoc => {
        if (pDoc.id !== currentUser.uid) initiateCall(pDoc.id, stream);
      });

    } catch (e) {
      console.error('Error joining voice:', e);
      setInRoom(false);
      setRoomId(null);
      isRunningRef.current = false;
    }
  };

  const initiateCall = async (targetUid, stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnections.current[targetUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      setRemoteStreams(prev => ({ ...prev, [targetUid]: event.streams[0] }));
    };

    const targetConnectionRef = doc(roomRef.current, 'participants', targetUid, 'connections', currentUser.uid);
    const callerCandidatesCollection = collection(targetConnectionRef, 'callerCandidates');

    pc.onicecandidate = event => {
      if (event.candidate) addDoc(callerCandidatesCollection, event.candidate.toJSON());
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(targetConnectionRef, { offer: { type: offer.type, sdp: offer.sdp } });

    const unsubAnswer = onSnapshot(targetConnectionRef, snapshot => {
      const data = snapshot.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });
    peerConnections.current[`_unsubAnswer_${targetUid}`] = unsubAnswer;

    const calleeCandidatesCollection = collection(targetConnectionRef, 'calleeCandidates');
    const unsubIce = onSnapshot(calleeCandidatesCollection, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      });
    });
    peerConnections.current[`_unsubIce_${targetUid}`] = unsubIce;
  };

  const handleIncomingOffer = async (callerUid, offer, stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnections.current[callerUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      setRemoteStreams(prev => ({ ...prev, [callerUid]: event.streams[0] }));
    };

    const myConnectionRef = doc(roomRef.current, 'participants', currentUser.uid, 'connections', callerUid);
    const calleeCandidatesCollection = collection(myConnectionRef, 'calleeCandidates');

    pc.onicecandidate = event => {
      if (event.candidate) addDoc(calleeCandidatesCollection, event.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(myConnectionRef, { answer: { type: answer.type, sdp: answer.sdp } });

    const callerCandidatesCollection = collection(myConnectionRef, 'callerCandidates');
    const unsubIce = onSnapshot(callerCandidatesCollection, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      });
    });
    peerConnections.current[`_unsubIce_${callerUid}`] = unsubIce;
  };

  const toggleMute = () => {
    const newMuted = !micMutedRef.current;
    micMutedRef.current = newMuted; // Update ref immediately for the RAF loop
    setMicMuted(newMuted);

    // Mute the raw mic tracks
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    }

    // Sync to Firestore
    if (roomRef.current && currentUser?.uid) {
      updateDoc(doc(roomRef.current, 'participants', currentUser.uid), { isMuted: newMuted }).catch(() => {});
    }
  };

  const leaveRoom = async () => {
    isRunningRef.current = false;

    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }

    // Close all peer connections and unsub listeners
    Object.keys(peerConnections.current).forEach(key => {
      const item = peerConnections.current[key];
      if (typeof item === 'function') item();
      else if (item && typeof item.close === 'function') item.close();
    });
    peerConnections.current = {};

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    try {
      if (currentUser?.uid && roomRef.current) {
        await deleteDoc(doc(roomRef.current, 'participants', currentUser.uid));
      }
    } catch (e) {}

    roomRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setRemoteStreams({});
    setParticipantsMeta({});
    setUserVolumes({});
    setInRoom(false);
    setIsScreenSharing(false);
    setMicMuted(false);
    micMutedRef.current = false;
    setRoomId(null);
  };

  useEffect(() => { return () => { leaveRoom(); }; }, []);

  const value = {
    roomId, localStream, screenStream, remoteStreams, participantsMeta,
    inRoom, joinRoom, leaveRoom, micMuted, toggleMute,
    deviceSettings, changeAudioSettings, userVolumes, setParticipantVolume,
    isScreenSharing, toggleScreenShare,
    analyserRef, audioCtxRef // expose for SettingsModal loopback/visualizer
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
