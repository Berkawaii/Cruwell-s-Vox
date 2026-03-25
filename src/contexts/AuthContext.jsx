import { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loginWithGoogle() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  }


  async function logout() {
    try {
      if (currentUser) {
        localStorage.removeItem(`cruwells_vox_access_${currentUser.uid}`);
      }
      localStorage.removeItem('cruwells_vox_access');
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  useEffect(() => {
    let unsubProfile = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setLoading(true);
        // Ensure user document exists in Firestore
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          // Check if this is the first user
          const coll = collection(db, 'users');
          const snapshot = await getCountFromServer(coll);
          const count = snapshot.data().count;
          const newRole = count === 0 ? 'admin' : 'member';
          
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || 'Guest User',
            role: newRole,
            createdAt: new Date().toISOString()
          });
        }

        // Listen for profile changes (like ban/role update)
        unsubProfile = onSnapshot(userRef, (docSnap) => {
          const profile = docSnap.data();
          if (profile?.role === 'banned') {
             // Force logout instantly
             localStorage.removeItem('cruwells_vox_access');
             signOut(auth);
             setCurrentUserProfile(null);
             setCurrentUser(null);
             alert("Your account has been banned from this server.");
          } else {
             setCurrentUserProfile(profile);
          }
          setLoading(false);
        });

        setCurrentUser(user);
      } else {
        if (unsubProfile) unsubProfile();
        setCurrentUser(null);
        setCurrentUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const value = {
    currentUser,
    currentUserProfile,
    loginWithGoogle,

    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
