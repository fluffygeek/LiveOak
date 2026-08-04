import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

let configured = false;

/**
 * Requires a custom dev client / production build (the native Google
 * Sign-In module isn't available in Expo Go) and the platform-specific
 * OAuth client IDs from docs/phase-0-checklist.md.
 *
 * iOS also needs the reversed-client-ID URL scheme registered via the
 * package's Expo config plugin — app.config.js derives it automatically from
 * EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS, so setting that env var is enough.
 */
function ensureConfigured() {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB;
  if (!webClientId) {
    throw new Error('EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB is not set');
  }
  const iosClientId =
    Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS : undefined;
  if (Platform.OS === 'ios' && !iosClientId) {
    throw new Error('EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS is not set');
  }
  GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
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

/** True when the user dismissed the native sign-in sheet — not a real failure. */
export function isSignInCancelled(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === statusCodes.SIGN_IN_CANCELLED;
}
