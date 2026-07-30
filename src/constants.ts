// from window.__NUXT__.config.public.BACKEND_URL (deepmind.appshots.design is a different service)
export const APPSHOTS_API_BASE = "https://be.appshots.design/api/v1";

// public firebase web key, also in the localStorage auth key
export const FIREBASE_API_KEY = "AIzaSyD0RRt1ciOD-6JZ2RfACtM0FkHc6w4ZXeg";

export const SECURETOKEN_URL = "https://securetoken.googleapis.com/v1/token";

export const FIREBASE_AUTH_USER_LS_KEY = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;

export const ENDPOINTS = {
  SEARCH_APP_SHOTS: "/search_app_shots_es/",
  SEARCH_SCREEN_TAGS: "/search_screen_tags_es/",
  SEARCH_UI_COMPONENTS: "/search_screen_ui_component_es/",
  SEARCH_TEXT_IN_IMAGES: "/search_text_in_images/",
  SEARCH_FLOWS: "/search_flows_es/",
} as const;

// note: each endpoint returns its rows under a different key
// (app_shots / appflow_appShots / screens / results) — see utils/formatting.ts

export const PLATFORMS = ["ios", "android", "web"] as const;
export type Platform = (typeof PLATFORMS)[number];

// per_page is honored up to the result count — no free-tier clamp observed.
// flows caps at 20; search_text_in_images ignores it and always returns 20.
export const DEFAULT_PER_PAGE = 20;
export const DEFAULT_SCOPE = "global";

export const TOKEN_REFRESH_BUFFER_SECONDS = 300;
export const REQUEST_TIMEOUT_MS = 10_000;

// only fetch screenshots from these hosts + bucket, so get-screens can't be used for ssrf
export const ALLOWED_IMAGE_HOSTS = ["firebasestorage.googleapis.com", "storage.googleapis.com"];
export const REQUIRED_IMAGE_URL_SUBSTRING = "appshots-design.appspot.com";

export const MAX_IMAGES_PER_CALL = 10;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const IMAGE_FETCH_TIMEOUT_MS = 15_000;
