import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../src/lib/auth-context';
import { signInWithGoogle, isSignInCancelled } from '../src/lib/google-signin';
import { Button } from '../src/components/Button';
import { Banner } from '../src/components/Banner';
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
      <View style={styles.brand}>
        <Text style={styles.logo}>🛠️</Text>
        <Text style={styles.title}>LiveOak</Text>
        <Text style={styles.subtitle}>Sign in with your company Google account to log jobs.</Text>
      </View>

      <View style={styles.actions}>
        <Button title={signingIn ? 'Signing in…' : 'Sign in with Google'} onPress={handleSignIn} loading={signingIn} />
        {error && <Banner tone="danger" message={error} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xxl,
    backgroundColor: colors.bg,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  actions: {
    gap: spacing.md,
  },
});
