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

const createFakeVideoTrack = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, 1, 1);
  const stream = canvas.captureStream(1);
  return stream.getVideoTracks()[0];
};

export function VoiceProvider({ children }) {
  const { currentUser } = useAuth();
  const [roomId, setRoomId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participantsMeta, setParticipantsMeta] = useState({});
  const [inRoom, setInRoom] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);

  const [deviceSettings, setDeviceSettings] = useState({
    audioInput: 'default',
    audioOutput: 'default',
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    manualGain: 1.0,
    noiseThreshold: -50 // dB
  });
  const [userVolumes, setUserVolumes] = useState({}); 
  const settingsRef = useRef(deviceSettings);

  useEffect(() => {
    settingsRef.current = deviceSettings;
  }, [deviceSettings]);

  const peerConnections = useRef({}); 
  const roomRef = useRef(null);
  const gainNodeRef = useRef(null);
  const audioCtxRef = useRef(null);
  const noiseGateRef = useRef(null); // This is just a GainNode for gating
  const analyserRef = useRef(null);

  useEffect(() => { return () => { leaveRoom(); }; }, []);

  const setParticipantVolume = (uid, volume) => {
    setUserVolumes(prev => ({...prev, [uid]: volume}));
  };

  const changeAudioSettings = async (key, value) => {
    setDeviceSettings(prev => ({...prev, [key]: value}));
    
    if (key === 'manualGain' && gainNodeRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(value, audioCtxRef.current.currentTime, 0.1);
      return;
    }

    if (key === 'noiseThreshold' && deviceSettings) {
      // Logic handled in the processor loop
      return;
    }

    if ((key === 'audioInput' || key === 'noiseSuppression' || key === 'echoCancellation' || key === 'autoGainControl') && inRoom && localStream) {
       try {
         const newAudioInput = key === 'audioInput' ? value : deviceSettings.audioInput;
         const newNS = key === 'noiseSuppression' ? value : deviceSettings.noiseSuppression;
         const newEC = key === 'echoCancellation' ? value : deviceSettings.echoCancellation;
         const newAGC = key === 'autoGainControl' ? value : deviceSettings.autoGainControl;
         
         const constraints = {
           audio: {
              deviceId: newAudioInput !== 'default' ? { exact: newAudioInput } : undefined,
              noiseSuppression: newNS,
              echoCancellation: newEC,
              autoGainControl: newAGC
           }
         };
         const newStream = await navigator.mediaDevices.getUserMedia(constraints);
         const rawTrack = newStream.getAudioTracks()[0];
         
         // Re-pipe through existing GainNode if possible
         if (audioCtxRef.current && gainNodeRef.current) {
            // Need to create a new source from the new track
            const source = audioCtxRef.current.createMediaStreamSource(new MediaStream([rawTrack]));
            source.connect(gainNodeRef.current);
            // destination is already connected to gainNode in joinRoom or previous calls
            // Wait, we should probably recreate the whole chain to be safe
         }

         const oldTrack = localStream.getAudioTracks()[0];
         localStream.removeTrack(oldTrack);
         oldTrack.stop();
         
         localStream.addTrack(rawTrack); // Simplified for now, will refine pipe in next step
         rawTrack.enabled = !micMuted;
         
         Object.values(peerConnections.current).forEach(pc => {
           if (pc && typeof pc.getSenders === 'function') {
             const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
             if (sender) sender.replaceTrack(rawTrack);
           }
         });
       } catch (e) {
         console.error("Failed to swap audio device track", e);
       }
    }
  };

  const toggleScreenShare = async () => {
    if (!inRoom || !localStream || !roomRef.current) return;

    if (isScreenSharing) {
       if (screenStream) screenStream.getTracks().forEach(t => t.stop());
       setScreenStream(null);
       setIsScreenSharing(false);
       
       const fakeTrack = createFakeVideoTrack();
       const currentVideoTrack = localStream.getVideoTracks()[0];
       if (currentVideoTrack) {
         localStream.removeTrack(currentVideoTrack);
         currentVideoTrack.stop();
       }
       localStream.addTrack(fakeTrack);

       Object.values(peerConnections.current).forEach(pc => {
           if (pc && typeof pc.getSenders === 'function') {
             const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
             if (sender) sender.replaceTrack(fakeTrack);
           }
       });

       await updateDoc(doc(roomRef.current, 'participants', currentUser.uid), { isScreenSharing: false }).catch(()=>{});
    } else {
       try {
         const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
         setScreenStream(displayStream);
         setIsScreenSharing(true);
         
         const newVideoTrack = displayStream.getVideoTracks()[0];
         
         newVideoTrack.onended = async () => {
             setScreenStream(null);
             setIsScreenSharing(false);
             const fkTrack = createFakeVideoTrack();
           localStream.removeTrack(currentVideoTrack);
           currentVideoTrack.stop();
         }
         localStream.addTrack(newVideoTrack);

         Object.values(peerConnections.current).forEach(pc => {
           if (pc && typeof pc.getSenders === 'function') {
             const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
             if (sender) sender.replaceTrack(newVideoTrack);
           }
         });

         await updateDoc(doc(roomRef.current, 'participants', currentUser.uid), { isScreenSharing: true }).catch(()=>{});
       } catch(e) {
         console.error("Screen share error", e);
       }
    }
  };

  const joinRoom = async (newRoomId) => {
    if (inRoom) await leaveRoom();
    if (!currentUser) return;

    try {
      setRoomId(newRoomId);
      roomRef.current = doc(db, 'webrtc_rooms', newRoomId);

      const constraints = {
        audio: {
           deviceId: deviceSettings.audioInput !== 'default' ? { exact: deviceSettings.audioInput } : undefined,
           noiseSuppression: deviceSettings.noiseSuppression,
           echoCancellation: deviceSettings.echoCancellation,
           autoGainControl: deviceSettings.autoGainControl
        },
        video: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Setup Audio Pipeline
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const gainNode = audioCtxRef.current.createGain();
      gainNode.gain.value = deviceSettings.manualGain;
      gainNodeRef.current = gainNode;
      
      const destination = audioCtxRef.current.createMediaStreamDestination();
      
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      
      const noiseGate = audioCtxRef.current.createGain();
      noiseGateRef.current = noiseGate;
      
      source.connect(gainNode);
      gainNode.connect(analyser); // Analyser looks at the signal after manual gain
      analyser.connect(noiseGate);
      noiseGate.connect(destination);
      
      // Noise Gate Processor Loop
      let lastTime = Date.now();
      const processNoiseGate = () => {
        if (!inRoom || !audioCtxRef.current || !analyserRef.current || !noiseGateRef.current) return;
        
        const dataArray = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const db = 20 * Math.log10(rms);
        
        // Threshold check
        const threshold = settingsRef.current.noiseThreshold;
        if (db < threshold) {
          // Gating out (Mute)
          noiseGateRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
        } else {
          // Passing through
          noiseGateRef.current.gain.setTargetAtTime(1, audioCtxRef.current.currentTime, 0.01);
        }
        
        requestAnimationFrame(processNoiseGate);
      };
      processNoiseGate();
      
      const processedStream = destination.stream;
      const fakeVideoTrack = createFakeVideoTrack();
      processedStream.addTrack(fakeVideoTrack);

      setLocalStream(processedStream);
      setInRoom(true);
      
      processedStream.getAudioTracks().forEach(t => t.enabled = !micMuted);

      const myParticipantRef = doc(roomRef.current, 'participants', currentUser.uid);
      await setDoc(myParticipantRef, { 
        joinedAt: Date.now(),
        displayName: currentUser.displayName || 'Guest User',
        photoURL: currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || 'Guest'}&background=random`,
        isScreenSharing: false,
        isMuted: micMuted
      });

      const unsubParticipants = onSnapshot(collection(roomRef.current, 'participants'), (snap) => {
        const meta = {};
        snap.docs.forEach(d => { meta[d.id] = d.data(); });
        setParticipantsMeta(meta);
      });
      peerConnections.current['participantsListener'] = unsubParticipants;

      const myConnectionsRef = collection(myParticipantRef, 'connections');
      const unsubIncoming = onSnapshot(myConnectionsRef, snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.offer) handleIncomingOffer(change.doc.id, data.offer, stream);
          }
        });
      });
      peerConnections.current['listener'] = unsubIncoming;

      const participantsSnap = await getDocs(collection(roomRef.current, 'participants'));
      participantsSnap.forEach(pDoc => {
        if (pDoc.id !== currentUser.uid) initiateCall(pDoc.id, stream);
      });
    } catch (e) {
      console.error("Error joining voice:", e);
      setInRoom(false);
      setRoomId(null);
    }
  };

  const initiateCall = async (targetUid, stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnections.current[targetUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => { setRemoteStreams(prev => ({ ...prev, [targetUid]: event.streams[0] })); };

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
      if (data?.answer && !pc.currentRemoteDescription) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });
    peerConnections.current[`unsubAnswer_${targetUid}`] = unsubAnswer;

    const calleeCandidatesCollection = collection(targetConnectionRef, 'calleeCandidates');
    const unsubIce = onSnapshot(calleeCandidatesCollection, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      });
    });
    peerConnections.current[`unsubIce_${targetUid}`] = unsubIce;
  };

  const handleIncomingOffer = async (callerUid, offer, stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnections.current[callerUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => { setRemoteStreams(prev => ({ ...prev, [callerUid]: event.streams[0] })); };

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
    peerConnections.current[`unsubIce_${callerUid}`] = unsubIce;
  };

  const toggleMute = () => {
    if (localStream) {
      const newMuted = !micMuted;
      localStream.getAudioTracks().forEach(track => { track.enabled = !newMuted; });
      
      // Also mute the processing nodes for safety
      if (audioCtxRef.current && gainNodeRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(newMuted ? 0 : settingsRef.current.manualGain, audioCtxRef.current.currentTime, 0.05);
      }
      
      setMicMuted(newMuted);
      if (roomRef.current && currentUser?.uid) {
         updateDoc(doc(roomRef.current, 'participants', currentUser.uid), { isMuted: newMuted }).catch(()=>{});
      }
    } else {
      setMicMuted(!micMuted);
    }
  };

  const leaveRoom = async () => {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); }

    Object.keys(peerConnections.current).forEach(key => {
      if (typeof peerConnections.current[key] === 'function') peerConnections.current[key](); 
      else peerConnections.current[key].close(); 
    });
    
    peerConnections.current = {};
    setRemoteStreams({});
    setUserVolumes({}); 
    setParticipantsMeta({});
    setInRoom(false);
    setLocalStream(null);
    setScreenStream(null);
    setIsScreenSharing(false);

    try {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(()=>{});
        audioCtxRef.current = null;
      }
      if (currentUser?.uid && roomRef.current) await deleteDoc(doc(roomRef.current, 'participants', currentUser.uid));
    } catch (e) {}
    
    setRoomId(null);
    roomRef.current = null;
  };

  const value = { 
    roomId, localStream, remoteStreams, participantsMeta, 
    inRoom, joinRoom, leaveRoom, micMuted, toggleMute,
    deviceSettings, changeAudioSettings, userVolumes, setParticipantVolume,
    isScreenSharing, toggleScreenShare
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
