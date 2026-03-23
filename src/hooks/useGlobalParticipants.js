import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collectionGroup, onSnapshot } from 'firebase/firestore';

export function useGlobalParticipants() {
  const [roomParticipants, setRoomParticipants] = useState({});

  useEffect(() => {
    // collectionGroup allows listening to ALL 'participants' collections across all rooms
    const unsubscribe = onSnapshot(collectionGroup(db, 'participants'), (snapshot) => {
      const mapping = {};
      snapshot.docs.forEach(doc => {
        const roomId = doc.ref.parent.parent.id;
        if (!mapping[roomId]) mapping[roomId] = [];
        mapping[roomId].push({
          uid: doc.id,
          ...doc.data()
        });
      });
      setRoomParticipants(mapping);
    }, (error) => {
      console.error("Error fetching global participants:", error);
    });

    return () => unsubscribe();
  }, []);

  return roomParticipants;
}
