import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
export const isFirebaseStorageEnabled =
  import.meta.env.VITE_FIREBASE_STORAGE_ENABLED === "true";
export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
void setPersistence(auth, browserLocalPersistence).catch(() => undefined);

// Enable offline persistence so Firestore reads work when client is offline
// (fixes "Failed to get document because the client is offline" for QR).
// Falls back to plain getFirestore on hot-reload or if init was already called.
let _firestore: ReturnType<typeof getFirestore>;
try {
  _firestore = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  _firestore = getFirestore(firebaseApp);
}
export const firestore = _firestore;
export const storage = getStorage(firebaseApp);
