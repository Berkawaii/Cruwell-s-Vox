import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useServerPassword() {
  const [serverPassword, setServerPassword] = useState("vox");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'server', 'settings');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().password) {
        setServerPassword(docSnap.data().password);
      } else {
        // Initialize if not exists
        setDoc(docRef, { password: 'vox' }, { merge: true });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching server password:", error);
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);

  const updatePassword = async (newPassword) => {
    if (!newPassword.trim()) return;
    const docRef = doc(db, 'server', 'settings');
    await setDoc(docRef, { password: newPassword }, { merge: true });
  };

  return { serverPassword, updatePassword, loading };
}
