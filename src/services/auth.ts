import { FIREBASE_API_KEY, SECURETOKEN_URL, TOKEN_REFRESH_BUFFER_SECONDS } from "../constants.js";
import type { FirebaseAuthUser, SecureTokenResponse } from "../types.js";

export interface StoredSession {
  idToken: string;
  refreshToken: string;
  expirationTime: number;
  uid?: string;
  email?: string;
}

// holds the firebase id token, refreshing it off the refresh token before expiry
export class AppshotsAuth {
  private session: StoredSession;
  private refreshPromise: Promise<void> | null = null;
  private onSessionRefreshed?: (session: StoredSession) => void;

  private constructor(session: StoredSession, onSessionRefreshed?: (session: StoredSession) => void) {
    this.session = session;
    this.onSessionRefreshed = onSessionRefreshed;
  }

  static fromStoredSession(
    session: StoredSession,
    onSessionRefreshed?: (session: StoredSession) => void,
  ): AppshotsAuth {
    return new AppshotsAuth(session, onSessionRefreshed);
  }

  // from the raw firebase:authUser localStorage blob
  static fromFirebaseAuthUser(
    raw: string | FirebaseAuthUser,
    onSessionRefreshed?: (session: StoredSession) => void,
  ): AppshotsAuth {
    const user: FirebaseAuthUser = typeof raw === "string" ? JSON.parse(raw) : raw;
    const stm = user?.stsTokenManager;
    if (!stm?.accessToken || !stm?.refreshToken) {
      throw new Error(
        "Could not find stsTokenManager tokens in the Firebase auth blob. " +
          `Copy the full value of the localStorage key 'firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]'.`,
      );
    }
    return new AppshotsAuth(
      {
        idToken: stm.accessToken,
        refreshToken: stm.refreshToken,
        expirationTime: stm.expirationTime ?? 0,
        uid: user.uid,
        email: user.email,
      },
      onSessionRefreshed,
    );
  }

  getSession(): StoredSession {
    return this.session;
  }

  // unverified jwt claims, just for whoami
  getClaims(): Record<string, unknown> {
    try {
      const payload = this.session.idToken.split(".")[1];
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    } catch {
      return {};
    }
  }

  async getIdToken(): Promise<string> {
    if (this.isExpiringSoon()) await this.refresh();
    return this.session.idToken;
  }

  private isExpiringSoon(): boolean {
    return Date.now() >= this.session.expirationTime - TOKEN_REFRESH_BUFFER_SECONDS * 1000;
  }

  // dedupe concurrent callers onto one refresh
  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    const res = await fetch(`${SECURETOKEN_URL}?key=${FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.session.refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Firebase token refresh failed (${res.status}): ${text.substring(0, 200)}. ` +
          "Run 'appshots-mcp auth' to re-authenticate.",
      );
    }

    const data = (await res.json()) as SecureTokenResponse;
    this.session = {
      idToken: data.id_token,
      refreshToken: data.refresh_token || this.session.refreshToken,
      expirationTime: Date.now() + Number(data.expires_in) * 1000,
      uid: data.user_id || this.session.uid,
      email: this.session.email,
    };
    this.onSessionRefreshed?.(this.session);
  }
}
