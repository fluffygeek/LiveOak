import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../src/lib/auth-context';
import { signInWithGoogle, isSignInCancelled } from '../src/lib/google-signin';
import { Button } from '../src/components/Button';
import { colors, spacing } from '../src/theme';

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
    } catch (err) {
      if (isSignInCancelled(err)) return;
      setError('Account not authorized, or sign-in failed. Contact your admin.');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LiveOak Technician</Text>
      <Button title={signingIn ? 'Signing in…' : 'Sign in with Google'} onPress={handleSignIn} loading={signingIn} />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
});
