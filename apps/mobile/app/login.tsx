import { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';
import { signInWithGoogle } from '../src/lib/google-signin';

export default function Login() {
  const { user, signInWithIdToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  if (user) {
    return <Redirect href="/home" />;
  }

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      const idToken = await signInWithGoogle();
      await signInWithIdToken(idToken);
    } catch {
      setError('Account not authorized, or sign-in failed. Contact your admin.');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>LiveOak Technician</Text>
      <Button title={signingIn ? 'Signing in…' : 'Sign in with Google'} onPress={handleSignIn} disabled={signingIn} />
      {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
    </View>
  );
}
