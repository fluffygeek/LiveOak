import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { users } from './schema.js';

/**
 * Bootstraps the very first app_admin. Necessary because every other user is
 * provisioned via the app_admin-only POST /users API — someone has to exist
 * before that's possible. Safe to re-run: upserts by email.
 *
 * Usage: pnpm --filter @liveoak/db seed:admin -- --email=you@company.com --name="Your Name"
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`--${flag}=`));
    return arg?.split('=').slice(1).join('=');
  };
  const email = get('email');
  const name = get('name');
  if (!email) {
    console.error('Usage: seed-admin --email=you@company.com [--name="Your Name"]');
    process.exit(1);
  }
  return { email, name };
}

async function main() {
  const { email, name } = parseArgs();
  const db = createDb();

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({ role: 'app_admin', active: true, displayName: name ?? existing.displayName })
      .where(eq(users.id, existing.id))
      .returning();
    console.log('Updated existing user to app_admin:', updated);
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, role: 'app_admin', displayName: name })
      .returning();
    console.log('Created first app_admin:', created);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
