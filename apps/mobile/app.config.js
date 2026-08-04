// Dynamic config (over app.json) so the iOS Google Sign-In URL scheme can be
// derived from EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS at prebuild time instead
// of living as a hand-edited placeholder that could reach Info.plist verbatim.

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

function reversedIosUrlScheme(iosClientId) {
  const prefix = iosClientId.endsWith(GOOGLE_CLIENT_ID_SUFFIX)
    ? iosClientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length)
    : '';
  if (!prefix) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS ("${iosClientId}") doesn't look like a Google ` +
        `OAuth client ID — expected a non-empty ID ending with "${GOOGLE_CLIENT_ID_SUFFIX}".`,
    );
  }
  return `com.googleusercontent.apps.${prefix}`;
}

const plugins = ['expo-router', 'expo-camera', 'expo-image-picker'];

// Only registered once a real iOS client ID is configured — omitting it here
// (rather than falling back to a placeholder) means an iOS build with no
// client ID fails at Google Sign-In configure-time with a clear error
// instead of silently shipping a broken URL scheme.
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS;
if (iosClientId) {
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: reversedIosUrlScheme(iosClientId) }]);
}

module.exports = {
  expo: {
    name: 'LiveOak',
    slug: 'liveoak-technician',
    scheme: 'liveoak',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.liveoak.technician',
      supportsTablet: false,
    },
    android: {
      package: 'com.liveoak.technician',
    },
    plugins,
  },
};
