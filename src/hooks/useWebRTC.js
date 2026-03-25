import { useEffect, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, onSnapshot, updateDoc, deleteDoc, addDoc, getDocs } from 'firebase/firestore';

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ]
};

export function useWebRTC(roomId, currentUser) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { uid: MediaStream }
  const [participantsMeta, setParticipantsMeta] = useState({}); // {uid: {displayName, photoURL}}
  const [inRoom, setInRoom] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  
  const peerConnections = useRef({}); 
  const roomRef = doc(db, 'webrtc_rooms', roomId);

  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, []);

  const joinRoom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalStream(stream);
      setInRoom(true);

      const myParticipantRef = doc(roomRef, 'participants', currentUser.uid);
      await setDoc(myParticipantRef, { 
        joinedAt: Date.now(),
        displayName: currentUser.displayName || 'Guest User'
      });

      // Listen to participants changes to get their metadata
      onSnapshot(collection(roomRef, 'participants'), (snap) => {
        const meta = {};
        snap.docs.forEach(d => {
            meta[d.id] = d.data();
        });
        setParticipantsMeta(meta);
      });

      // Listen for incoming offers
      const myConnectionsRef = collection(myParticipantRef, 'connections');
      const unsubIncoming = onSnapshot(myConnectionsRef, snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.offer) {
              handleIncomingOffer(change.doc.id, data.offer, stream);
            }
          }
        });
      });
      peerConnections.current['listener'] = unsubIncoming;

      // Call existing participants
      const participantsSnap = await getDocs(collection(roomRef, 'participants'));
      participantsSnap.forEach(pDoc => {
        if (pDoc.id !== currentUser.uid) {
          initiateCall(pDoc.id, stream);
        }
      });
    } catch (e) {
      console.error("Error joining voice:", e);
    }
  };

  const initiateCall = async (targetUid, stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnections.current[targetUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      setRemoteStreams(prev => ({ ...prev, [targetUid]: event.streams[0] }));
    };

    const targetConnectionRef = doc(roomRef, 'participants', targetUid, 'connections', currentUser.uid);
    const callerCandidatesCollection = collection(targetConnectionRef, 'callerCandidates');
    
    pc.onicecandidate = event => {
      if (event.candidate) {
        addDoc(callerCandidatesCollection, event.candidate.toJSON());
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await setDoc(targetConnectionRef, { offer: { type: offer.type, sdp: offer.sdp } });

    onSnapshot(targetConnectionRef, snapshot => {
      const data = snapshot.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    const calleeCandidatesCollection = collection(targetConnectionRef, 'calleeCandidates');
    onSnapshot(calleeCandidatesCollection, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });
  };

  const handleIncomingOffer = async (callerUid, offer, stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnections.current[callerUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = event => {
      setRemoteStreams(prev => ({ ...prev, [callerUid]: event.streams[0] }));
    };

    const myConnectionRef = doc(roomRef, 'participants', currentUser.uid, 'connections', callerUid);
    const calleeCandidatesCollection = collection(myConnectionRef, 'calleeCandidates');

    pc.onicecandidate = event => {
      if (event.candidate) {
        addDoc(calleeCandidatesCollection, event.candidate.toJSON());
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(myConnectionRef, { answer: { type: answer.type, sdp: answer.sdp } });

    const callerCandidatesCollection = collection(myConnectionRef, 'callerCandidates');
    onSnapshot(callerCandidatesCollection, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => { track.enabled = !track.enabled; });
      setMicMuted(!localStream.getAudioTracks()[0].enabled);
    }
  };

  const leaveRoom = async () => {
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); }
    Object.keys(peerConnections.current).forEach(uid => {
      if (uid === 'listener') { peerConnections.current[uid](); } 
      else { peerConnections.current[uid].close(); }
    });
    
    peerConnections.current = {};
    setRemoteStreams({});
    setInRoom(false);
    setLocalStream(null);

    try {
      if (currentUser?.uid) {
        await deleteDoc(doc(roomRef, 'participants', currentUser.uid));
      }
    } catch (e) {}
  };

  return { localStream, remoteStreams, participantsMeta, inRoom, joinRoom, leaveRoom, micMuted, toggleMute };
}
