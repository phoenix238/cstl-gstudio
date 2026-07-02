import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const TOKEN_KEY = 'google_access_token';
const TOKEN_EXPIRY_KEY = 'google_access_token_expiry';
const TOKEN_TTL_MS = 55 * 60 * 1000;

export class GoogleTokenExpiredError extends Error {
  constructor(message = 'Google Workspace access expired. Please sign in again.') {
    super(message);
    this.name = 'GoogleTokenExpiredError';
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar');
googleProvider.addScope('https://www.googleapis.com/auth/documents');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry || Date.now() >= Number(expiry)) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

function persistAccessToken(token: string) {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + TOKEN_TTL_MS));
  }
}

function clearStoredToken() {
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
}

export function isGoogleTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;
  const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return true;
  return Date.now() >= Number(expiry);
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  cachedAccessToken = readStoredToken();

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const storedToken = readStoredToken();
      if (storedToken) {
        cachedAccessToken = storedToken;
        onAuthSuccess?.(user, storedToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      clearStoredToken();
      onAuthFailure?.();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google Access Token.');
    }

    persistAccessToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: unknown) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const refreshGoogleAccessToken = async (): Promise<string> => {
  const result = await googleSignIn();
  if (!result?.accessToken) {
    throw new GoogleTokenExpiredError();
  }
  return result.accessToken;
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && !isGoogleTokenExpired()) {
    return cachedAccessToken;
  }
  const stored = readStoredToken();
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

export const ensureGoogleAccessToken = async (): Promise<string> => {
  const token = await getAccessToken();
  if (token) return token;
  return refreshGoogleAccessToken();
};

export const setAccessToken = (token: string | null) => {
  if (token) {
    persistAccessToken(token);
  } else {
    clearStoredToken();
  }
};

export const googleLogout = async () => {
  await auth.signOut();
  clearStoredToken();
};