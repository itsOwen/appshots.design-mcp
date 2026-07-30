import type { Platform } from "./constants.js";

// firebase's localStorage authUser blob (only the fields we touch)
export interface FirebaseAuthUser {
  uid: string;
  email?: string;
  displayName?: string;
  stsTokenManager: {
    refreshToken: string;
    accessToken: string;
    expirationTime: number;
  };
  apiKey?: string;
  [key: string]: unknown;
}

// google secure token refresh response
export interface SecureTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: string;
  token_type: string;
  user_id: string;
  project_id: string;
}

// note: the api uses `q`, not `query`
export interface SearchParams {
  q: string;
  platform: Platform;
  page: number;
  per_page: number;
  scope: string;
  app_slug?: string;
}

export interface Screen {
  id?: number;
  img_url?: string;
  platform?: string;
  tags?: string[];
  // present on the per-screen endpoints (tags / ui components), not on nested app screens
  app_name?: string;
  app_slug?: string;
  screen_slug?: string;
  description?: string;
  [key: string]: unknown;
}

// an app bundling its screens
export interface AppShot {
  app_name?: string;
  app_icon?: string;
  short_description?: string;
  slug?: string;
  platforms?: string[];
  developer?: string;
  upvote_count?: number;
  screens?: Screen[];
  thumbnails?: Screen[];
  [key: string]: unknown;
}

// rows live under a per-endpoint key; envelope is shared
export interface PagedResponse {
  total_count?: number;
  total_pages?: number;
  current_page?: number;
  has_next?: boolean;
  has_previous?: boolean;
  q?: string;
  [key: string]: unknown;
}

export type AppShotsSearchResponse = PagedResponse & { app_shots?: AppShot[] };
