import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getApps, initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyCcgL3_Og3GvkhEsbKEe_KGkJYPJVKUlwM',
  authDomain: 'focus-task-manager-517df.firebaseapp.com',
  projectId: 'focus-task-manager-517df',
  storageBucket: 'focus-task-manager-517df.firebasestorage.app',
  messagingSenderId: '620050111019',
  appId: '1:620050111019:web:24c4632833ab88094f686e',
};

export const authorizedEmails = ['dograsiddhant@gmail.com'];

export const firebaseApp = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn('Firebase Auth persistence could not be enabled', error);
});

try {
  // IndexedDB persistence gives the PWA an offline task cache. The multi-tab
  // manager prevents a browser tab and the installed app from fighting over it.
  initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  // Vite hot reload may have already initialized Firestore.
}

export const db = getFirestore(firebaseApp);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const isApprovedUser = (user) => (
  !!user?.email
  && authorizedEmails.includes(user.email.toLowerCase())
  && user.emailVerified
);

export function observeAuth(onUser, onError) {
  let active = true;

  authPersistenceReady
    .then(() => getRedirectResult(auth))
    .catch((error) => {
      if (active && error?.code !== 'auth/no-auth-event') onError?.(error);
    });

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!active) return;
    if (user && !isApprovedUser(user)) {
      await signOut(auth);
      onError?.(new Error('This Google account is not authorized to use Focus.'));
      return;
    }
    onUser(user || null);
  }, onError);

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function signInWithGoogle() {
  await authPersistenceReady;
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (
      error?.code === 'auth/popup-blocked'
      || error?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

export function signOutUser() {
  return signOut(auth);
}
