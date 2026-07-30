import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import type { StoredSession } from "../services/auth.js";

const AUTH_DIR = join(homedir(), ".appshots-mcp");
const AUTH_FILE = join(AUTH_DIR, "auth.json");

export function readStoredSession(): StoredSession | null {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    const parsed = JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as StoredSession;
    if (!parsed.idToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession): void {
  mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(AUTH_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

export { AUTH_FILE };
