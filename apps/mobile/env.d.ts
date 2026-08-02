// Expo inlines EXPO_PUBLIC_-prefixed env vars into process.env at build time.
// Declared minimally here rather than pulling in @types/node, which would
// conflict with React Native's own global type definitions (fetch, Blob, etc).
declare const process: {
  env: Record<string, string | undefined>;
};
