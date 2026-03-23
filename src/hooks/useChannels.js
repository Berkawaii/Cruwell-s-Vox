import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';

export function useChannels() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAndProvision = async () => {
      try {
        const coll = collection(db, 'channels');
        const snapshot = await getCountFromServer(coll);
        if (snapshot.data().count === 0) {
          // Provision default channels
          await setDoc(doc(coll, 'general'), { name: 'general', type: 'text', createdAt: Date.now() });
          await setDoc(doc(coll, 'announcements'), { name: 'announcements', type: 'text', createdAt: Date.now() + 1 });
          await setDoc(doc(coll, 'general-voice'), { name: 'General Voice', type: 'voice', createdAt: Date.now() + 2 });
        }
      } catch (err) {
        console.error("Error provisioning default channels", err);
      }
    };
    
    checkAndProvision();

    const q = query(collection(db, 'channels'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chans = [];
      snapshot.forEach(docSnap => {
        chans.push({ id: docSnap.id, ...docSnap.data() });
      });
      setChannels(chans);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const createChannel = async (name, type) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);
    const docRef = doc(db, 'channels', id);
    await setDoc(docRef, { name, type, createdAt: Date.now() });
    return id;
  };

  const updateChannelName = async (id, newName) => {
    const docRef = doc(db, 'channels', id);
    await setDoc(docRef, { name: newName }, { merge: true });
  };

  const removeChannel = async (id) => {
    if (id === 'general' || id === 'general-voice') return; // protect default channels
    await deleteDoc(doc(db, 'channels', id));
  };

  return { channels, createChannel, updateChannelName, removeChannel, loading };
}
