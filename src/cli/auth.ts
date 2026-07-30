import { createInterface } from "node:readline";
import { FIREBASE_AUTH_USER_LS_KEY } from "../constants.js";
import { AppshotsAuth } from "../services/auth.js";
import { writeStoredSession, AUTH_FILE } from "../utils/auth-store.js";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}

// paste the firebase:authUser localStorage blob, validate via a refresh, save
export async function runAuthFlow(): Promise<void> {
  console.log("appshots-mcp — authentication\n");
  console.log("appshots stores your session in localStorage, not a cookie. To copy it:\n");
  console.log("  1. Open https://appshots.design and log in");
  console.log("  2. DevTools (F12) → Console, then run:");
  console.log(`     copy(localStorage['${FIREBASE_AUTH_USER_LS_KEY}'])`);
  console.log("  3. Paste the copied value below.\n");

  const raw = (await prompt("Paste the Firebase auth JSON: ")).trim();
  if (!raw) {
    console.error("No input received. Aborting.");
    process.exit(1);
  }

  let auth: AppshotsAuth;
  try {
    auth = AppshotsAuth.fromFirebaseAuthUser(raw, writeStoredSession);
  } catch (err) {
    console.error(`\nCould not parse that value: ${(err as Error).message}`);
    process.exit(1);
  }

  // force a refresh (not getIdToken — a fresh token isn't expiring, so that
  // would skip the network call and "validate" anything that parses)
  try {
    await auth.refresh(); // onSessionRefreshed persists it
  } catch (err) {
    console.error(`\nToken validation failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const s = auth.getSession();
  console.log(`\n✅ Authenticated${s.email ? ` as ${s.email}` : ""}.`);
  console.log(`   Session saved to ${AUTH_FILE}`);
  console.log("   The ID token will be auto-refreshed as it expires.");
}
