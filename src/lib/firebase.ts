import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export interface FirestoreConnectivityResult {
  reachable: boolean;
  error?: string;
}

export async function testFirestoreConnection(): Promise<FirestoreConnectivityResult> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { reachable: true };
  } catch (error: any) {
    const message = String(error?.message || error?.code || '');
    // permission-denied or not-found still proves the Firestore server responded
    if (
      message.includes('permission-denied') ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('not-found')
    ) {
      return { reachable: true };
    }
    if (message.includes('the client is offline') || message.includes('unavailable')) {
      return {
        reachable: false,
        error: 'Firestore unreachable from this browser (offline or unconfigured database).',
      };
    }
    return { reachable: false, error: message || 'Firestore connection check failed.' };
  }
}
