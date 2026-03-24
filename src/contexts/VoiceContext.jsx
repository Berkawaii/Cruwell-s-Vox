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

// We no longer need fake video tracks because we use perfect negotiation


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
    noiseThreshold: -50,
    useRNNoise: true
  });
  const [userVolumes, setUserVolumes] = useState({});

  // Use refs for values needed inside long-lived callbacks
  const settingsRef = useRef(deviceSettings);
  const micMutedRef = useRef(false);
  const peerConnections = useRef({});
  const roomRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pendingCallsRef = useRef(new Set());
  const gainNodeRef = useRef(null);
  const noiseGateRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const isRunningRef = useRef(false); // controls the RAF loop
  const rnnoiseNodeRef = useRef(null); // RNNoise AudioWorklet node
  const compressorRef = useRef(null); // DynamicsCompressor node

  useEffect(() => { settingsRef.current = deviceSettings; }, [deviceSettings]);
  useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);

  const setParticipantVolume = (uid, volume) => {
    setUserVolumes(prev => ({ ...prev, [uid]: volume }));
  };

  const shouldInitiateCall = (targetUid) => {
    // Deterministic caller election avoids double-dial glare when users join simultaneously.
    return String(currentUser?.uid || '') < String(targetUid);
  };

  const changeAudioSettings = async (key, value) => {
    setDeviceSettings(prev => ({ ...prev, [key]: value }));

    if (key === 'manualGain' && gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(value, audioCtxRef.current.currentTime, 0.1);
      return;
    }
    if (key === 'noiseThreshold') return;

    if (key === 'useRNNoise' && rnnoiseNodeRef.current) {
      // Send message to RNNoise processor to enable/disable
      rnnoiseNodeRef.current.port.postMessage({ type: 'enable', enabled: value });
      return;
    }

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
      // Stop screen share -> Remove video track entirely to force renegotiation
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        
        Object.values(peerConnections.current).forEach(pc => {
          if (pc && typeof pc.getSenders === 'function') {
            const senders = pc.getSenders();
            // Remove ALL video senders
            senders.forEach(sender => {
              if (sender.track && sender.track.kind === 'video') pc.removeTrack(sender);
            });
          }
        });
        
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      setIsScreenSharing(false);

      await updateDoc(doc(roomRef.current, 'participants', currentUser.uid), { isScreenSharing: false }).catch(() => {});
    } else {
      try {
        const dispStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
        screenStreamRef.current = dispStream;
        setScreenStream(dispStream);
        setIsScreenSharing(true);

        const videoTrack = dispStream.getVideoTracks()[0];
        videoTrack.onended = () => {
          if (isRunningRef.current) toggleScreenShare();
        };

        // Add track to peer connections to trigger renegotiation
        Object.values(peerConnections.current).forEach(pc => {
          if (pc && typeof pc.addTrack === 'function') {
            pc.addTrack(videoTrack, dispStream);
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
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      
      const source = audioCtxRef.current.createMediaStreamSource(stream);

      // ──── RNNoise AudioWorklet ────────────────────────────────────────
      let rnnoiseNode = null;
      if (s.useRNNoise) {
        try {
          await audioCtxRef.current.audioWorklet.addModule('/rnnoise-processor.js');
          rnnoiseNode = new AudioWorkletNode(audioCtxRef.current, 'rnnoise-processor');
          rnnoiseNodeRef.current = rnnoiseNode;
        } catch (error) {
          console.warn('Failed to load RNNoise AudioWorklet:', error);
        }
      }

      // ──── Compressor (Dynamic Range Compression) ──────────────────────
      const compressor = audioCtxRef.current.createDynamicsCompressor();
      compressor.threshold.value = -50; // dB
      compressor.knee.value = 40; // dB (smooth transition)
      compressor.ratio.value = 12; // Compression ratio
      compressor.attack.value = 0.003; // Fast attack (3ms)
      compressor.release.value = 0.25; // Moderate release
      compressorRef.current = compressor;

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

      // Connect pipeline: source -> (RNNoise?) -> Compressor -> Analyser -> gainNode -> noiseGate -> destination
      source.connect(rnnoiseNode || compressor);
      if (rnnoiseNode) {
        rnnoiseNode.connect(compressor);
      }
      compressor.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(noiseGate);
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

      const processedStream = destination.stream;

      setLocalStream(processedStream);
      setInRoom(true);

      // Register self in Firestore
      const myParticipantRef = doc(roomRef.current, 'participants', currentUser.uid);
      
      // Clean stale connection data from previous sessions to prevent ICE errors
      const oldConnections = await getDocs(collection(myParticipantRef, 'connections'));
      for (const connDoc of oldConnections.docs) {
        // Delete subcollections
        const callerCands = await getDocs(collection(connDoc.ref, 'callerCandidates'));
        for (const c of callerCands.docs) await deleteDoc(c.ref);
        const calleeCands = await getDocs(collection(connDoc.ref, 'calleeCandidates'));
        for (const c of calleeCands.docs) await deleteDoc(c.ref);
        await deleteDoc(connDoc.ref);
      }

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

        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const uid = change.doc.id;
          if (uid === currentUser.uid) return;

          // Create only one outbound connection per peer across all clients.
          if (!shouldInitiateCall(uid)) return;
          if (peerConnections.current[uid] || pendingCallsRef.current.has(uid)) return;

          pendingCallsRef.current.add(uid);
          initiateCall(uid, processedStream)
            .catch(err => console.error('Failed to initiate call on participant add:', err))
            .finally(() => pendingCallsRef.current.delete(uid));
        });
      });
      peerConnections.current['_unsubParticipants'] = unsubParticipants;

      // Listen for incoming offers (others calling us)
      const myConnectionsRef = collection(myParticipantRef, 'connections');
      const unsubIncoming = onSnapshot(myConnectionsRef, snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            // Send processedStream (noise-gated) to peers, NOT raw mic
            if (data.callerOffer || data.offer) handleIncomingOffer(change.doc.id, data.callerOffer || data.offer, processedStream);
          }
        });
      });
      peerConnections.current['_unsubIncoming'] = unsubIncoming;

      // Call everyone already in the room — send processedStream (noise-gated)
      const participantsSnap = await getDocs(collection(roomRef.current, 'participants'));
      participantsSnap.forEach(pDoc => {
        if (pDoc.id === currentUser.uid) return;
        if (!shouldInitiateCall(pDoc.id)) return;
        if (peerConnections.current[pDoc.id] || pendingCallsRef.current.has(pDoc.id)) return;

        pendingCallsRef.current.add(pDoc.id);
        initiateCall(pDoc.id, processedStream)
          .catch(err => console.error('Failed to initiate call on room join:', err))
          .finally(() => pendingCallsRef.current.delete(pDoc.id));
      });

    } catch (e) {
      console.error('Error joining voice:', e);
      setInRoom(false);
      setRoomId(null);
      isRunningRef.current = false;
    }
  };

  // Helper to delete a Firestore connection doc and its subcollections
  const deleteConnectionDoc = async (connDocRef) => {
    try {
      const callerCands = await getDocs(collection(connDocRef, 'callerCandidates'));
      for (const c of callerCands.docs) await deleteDoc(c.ref);
      const calleeCands = await getDocs(collection(connDocRef, 'calleeCandidates'));
      for (const c of calleeCands.docs) await deleteDoc(c.ref);
      await deleteDoc(connDocRef);
    } catch (e) { /* ignore cleanup errors */ }
  };

  const initiateCall = async (targetUid, stream) => {
    // Close existing peer connection if one exists (e.g. after page refresh)
    if (peerConnections.current[targetUid]) {
      const oldPc = peerConnections.current[targetUid];
      if (typeof oldPc.close === 'function') oldPc.close();
    }
    // Unsub old listeners
    ['_unsubSignal_', '_unsubIce_', '_unsubAnswer_'].forEach(prefix => {
      const unsub = peerConnections.current[prefix + targetUid];
      if (typeof unsub === 'function') unsub();
    });

    const connectionRef = doc(roomRef.current, 'participants', targetUid, 'connections', currentUser.uid);

    // Clean stale connection data before creating new signaling
    await deleteConnectionDoc(connectionRef);

    const pc = new RTCPeerConnection(servers);
    peerConnections.current[targetUid] = pc;

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch (_) {}
      }
    };

    pc.ontrack = event => {
      setRemoteStreams(prev => {
        const existing = prev[targetUid] ? new MediaStream(prev[targetUid].getTracks()) : new MediaStream();
        existing.getTracks().filter(t => t.kind === event.track.kind).forEach(t => existing.removeTrack(t));
        existing.addTrack(event.track);
        return { ...prev, [targetUid]: existing };
      });
    };

    let lastAppliedAnswer = null;
    let lastAppliedOffer = null;
    let iceBuffer = [];

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(connectionRef, { callerOffer: { type: offer.type, sdp: offer.sdp }, timestamp: Date.now() }, { merge: true });
      } catch (err) {
        console.error("Negotiation error:", err);
      }
    };

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = event => {
      if (event.candidate) addDoc(collection(connectionRef, 'callerCandidates'), event.candidate.toJSON());
    };

    const processIceBuffer = () => {
      iceBuffer.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.warn("ICE error:", e)));
      iceBuffer = [];
    };

    const unsubSignal = onSnapshot(connectionRef, async snapshot => {
      const data = snapshot.data();
      if (!data) return;

      try {
        // Handle incoming answers to our callerOffers
        if (data.calleeAnswer && data.calleeAnswer.sdp !== lastAppliedAnswer && pc.signalingState === "have-local-offer") {
          lastAppliedAnswer = data.calleeAnswer.sdp;
          await pc.setRemoteDescription(new RTCSessionDescription(data.calleeAnswer));
          processIceBuffer();
        }
        
        // Handle incoming offers from callee (if they add a screen track)
        if (data.calleeOffer && data.calleeOffer.sdp !== lastAppliedOffer && pc.signalingState === "stable") {
          lastAppliedOffer = data.calleeOffer.sdp;
          await pc.setRemoteDescription(new RTCSessionDescription(data.calleeOffer));
          processIceBuffer();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await setDoc(connectionRef, { callerAnswer: { type: answer.type, sdp: answer.sdp }, timestamp: Date.now() }, { merge: true });
        }
      } catch (e) { console.error("Signal error caller:", e); }
    });
    peerConnections.current[`_unsubSignal_${targetUid}`] = unsubSignal;

    const unsubIce = onSnapshot(collection(connectionRef, 'calleeCandidates'), snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          if (pc.remoteDescription) {
            pc.addIceCandidate(candidate).catch(e => console.warn("ICE error:", e));
          } else {
            iceBuffer.push(candidate);
          }
        }
      });
    });
    peerConnections.current[`_unsubIce_${targetUid}`] = unsubIce;
  };

  const handleIncomingOffer = async (callerUid, initialOffer, stream) => {
    // Close existing peer connection if one exists (e.g. caller refreshed)
    if (peerConnections.current[callerUid]) {
      const oldPc = peerConnections.current[callerUid];
      if (typeof oldPc.close === 'function') oldPc.close();
    }
    ['_unsubSignal_', '_unsubIce_'].forEach(prefix => {
      const unsub = peerConnections.current[prefix + callerUid];
      if (typeof unsub === 'function') unsub();
    });

    const pc = new RTCPeerConnection(servers);
    peerConnections.current[callerUid] = pc;
    const connectionRef = doc(roomRef.current, 'participants', currentUser.uid, 'connections', callerUid);

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch (_) {}
      }
    };

    pc.ontrack = event => {
      setRemoteStreams(prev => {
        const existing = prev[callerUid] ? new MediaStream(prev[callerUid].getTracks()) : new MediaStream();
        existing.getTracks().filter(t => t.kind === event.track.kind).forEach(t => existing.removeTrack(t));
        existing.addTrack(event.track);
        return { ...prev, [callerUid]: existing };
      });
    };

    let lastAppliedAnswer = null;
    let lastAppliedOffer = initialOffer.sdp;
    let iceBuffer = [];

    // Define the handler, but do NOT attach it yet
    const handleNegotiationNeeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(connectionRef, { calleeOffer: { type: offer.type, sdp: offer.sdp }, timestamp: Date.now() }, { merge: true });
      } catch (err) { console.error("Negotiation error:", err); }
    };

    const processIceBuffer = () => {
      iceBuffer.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.warn("ICE error:", e)));
      iceBuffer = [];
    };

    // Handle initial incoming connection
    await pc.setRemoteDescription(new RTCSessionDescription(initialOffer));
    processIceBuffer();
    
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    const initialAnswer = await pc.createAnswer();
    await pc.setLocalDescription(initialAnswer);
    await setDoc(connectionRef, { calleeAnswer: { type: initialAnswer.type, sdp: initialAnswer.sdp }, timestamp: Date.now() }, { merge: true });

    // Attach handler AFTER initial SDP is resolved to prevent SDP glare (sending calleeOffer immediately after calleeAnswer)
    pc.onnegotiationneeded = handleNegotiationNeeded;

    pc.onicecandidate = event => {
      if (event.candidate) addDoc(collection(connectionRef, 'calleeCandidates'), event.candidate.toJSON());
    };

    const unsubSignal = onSnapshot(connectionRef, async snapshot => {
      const data = snapshot.data();
      if (!data) return;

      try {
        // Handle new offers from caller (if they add a track)
        if (data.callerOffer && data.callerOffer.sdp !== lastAppliedOffer && pc.signalingState === "stable") {
          lastAppliedOffer = data.callerOffer.sdp;
          await pc.setRemoteDescription(new RTCSessionDescription(data.callerOffer));
          processIceBuffer();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await setDoc(connectionRef, { calleeAnswer: { type: answer.type, sdp: answer.sdp }, timestamp: Date.now() }, { merge: true });
        }

        // Handle incoming answers to our calleeOffers
        if (data.callerAnswer && data.callerAnswer.sdp !== lastAppliedAnswer && pc.signalingState === "have-local-offer") {
          lastAppliedAnswer = data.callerAnswer.sdp;
          await pc.setRemoteDescription(new RTCSessionDescription(data.callerAnswer));
          processIceBuffer();
        }
      } catch (e) { console.error("Signal error callee:", e); }
    });
    peerConnections.current[`_unsubSignal_${callerUid}`] = unsubSignal;

    const unsubIce = onSnapshot(collection(connectionRef, 'callerCandidates'), snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          if (pc.remoteDescription) {
            pc.addIceCandidate(candidate).catch(e => console.warn("ICE error:", e));
          } else {
            iceBuffer.push(candidate);
          }
        }
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
    pendingCallsRef.current.clear();

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    try {
      if (currentUser?.uid && roomRef.current) {
        // Clean our connection docs
        const myParticipantRef = doc(roomRef.current, 'participants', currentUser.uid);
        const myConns = await getDocs(collection(myParticipantRef, 'connections'));
        for (const connDoc of myConns.docs) await deleteConnectionDoc(connDoc.ref);

        // Also clean connection docs OTHER participants have pointing to us
        const allParticipants = await getDocs(collection(roomRef.current, 'participants'));
        for (const pDoc of allParticipants.docs) {
          if (pDoc.id !== currentUser.uid) {
            const theirConnToUs = doc(roomRef.current, 'participants', pDoc.id, 'connections', currentUser.uid);
            await deleteConnectionDoc(theirConnToUs);
          }
        }

        await deleteDoc(myParticipantRef);
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

  useEffect(() => {
    const handleBeforeUnload = () => { leaveRoom(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      leaveRoom();
    };
  }, []);

  const value = {
    roomId, localStream, screenStream, remoteStreams, participantsMeta,
    inRoom, joinRoom, leaveRoom, micMuted, toggleMute,
    deviceSettings, changeAudioSettings, userVolumes, setParticipantVolume,
    isScreenSharing, toggleScreenShare,
    analyserRef, audioCtxRef // expose for SettingsModal loopback/visualizer
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
