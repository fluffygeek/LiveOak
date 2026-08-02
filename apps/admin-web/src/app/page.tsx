/**
 * Placeholder landing/login page. Real implementation (Phase 1) verifies the
 * Google ID token server-side against the same /auth/google logic the API
 * uses for mobile, per the design plan's "one source of truth for auth rules"
 * decision.
 */
export default function LoginPage() {
  return (
    <main>
      <h1>LiveOak Admin</h1>
      <p>Sign-in with Google (Workspace-restricted) — Phase 1.</p>
    </main>
  );
}
