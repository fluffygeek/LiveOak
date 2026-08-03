'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth-context';

// Minimal ambient shape for the bits of Google Identity Services we use;
// the full types live in an untyped script loaded at runtime.
interface GoogleCredentialResponse {
  credential: string;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: { theme: string; size: string }) => void;
        };
      };
    };
  }
}

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Renders Google's "Sign in with Google" button and, on success, exchanges
 * the resulting ID token for a LiveOak session via AuthProvider. The button
 * itself enforces nothing about our Workspace domain restriction — that
 * check happens server-side in apps/api's /auth/google (see design plan §7).
 */
export function GoogleSignInButton() {
  const buttonRef = useRef<HTMLDivElement>(null);
  const { signInWithIdToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB;
    if (!clientId) {
      setError('Google sign-in is not configured (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB missing).');
      return;
    }

    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            await signInWithIdToken(response.credential);
          } catch {
            setError('Sign-in failed — your account may not be provisioned yet. Contact your admin.');
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large' });
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [signInWithIdToken]);

  return (
    <div>
      <div ref={buttonRef} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
