import { Stack } from 'expo-router';
import { AuthProvider } from '../src/lib/auth-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign In' }} />
        <Stack.Screen name="home" options={{ title: 'LiveOak' }} />
        <Stack.Screen name="new-job" options={{ title: 'New Job' }} />
        <Stack.Screen name="weekly" options={{ title: 'My Weekly Jobs' }} />
      </Stack>
    </AuthProvider>
  );
}
