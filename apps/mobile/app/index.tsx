import { Text, View } from 'react-native';

/**
 * Placeholder home screen. Real implementation (Phase 2) branches on
 * sign-in state and an existing draft job — see the mobile flow diagram
 * in the design plan (docs, §4).
 */
export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>LiveOak Technician — Phase 2 (Google Sign-In + job submission)</Text>
    </View>
  );
}
