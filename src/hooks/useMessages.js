import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  limit,
  doc,
  deleteDoc
} from 'firebase/firestore';

export function useMessages(roomId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'rooms', roomId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching messages:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomId]);

  const sendMessage = async (text, user) => {
    if (!text.trim() || !user || !roomId) return;
    
    await addDoc(collection(db, 'rooms', roomId, 'messages'), {
      text,
      uid: user.uid,
      displayName: user.displayName || 'Guest User',
      photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'Guest'}&background=random`,
      createdAt: serverTimestamp()
    });
  };

  const deleteMessage = async (messageId) => {
    if (!roomId || !messageId) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'messages', messageId));
    } catch (e) {
      console.error("Error deleting message:", e);
    }
  };

  return { messages, loading, sendMessage, deleteMessage };
}
