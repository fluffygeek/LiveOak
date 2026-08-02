import { GoogleSignin } from '@react-native-google-signin/google-signin';

let configured = false;

/**
 * Requires a custom dev client / production build (the native Google
 * Sign-In module isn't available in Expo Go) and the platform-specific
 * OAuth client IDs from docs/phase-0-checklist.md.
 */
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB,
    offlineAccess: false,
  });
  configured = true;
}

/** Runs the native Google Sign-In flow and returns the ID token to exchange with /auth/google. */
export async function signInWithGoogle(): Promise<string> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  const idToken = result.data?.idToken;
  if (!idToken) {
    throw new Error('Google Sign-In did not return an ID token');
  }
  return idToken;
}
