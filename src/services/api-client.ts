import {
  ALLOWED_IMAGE_HOSTS,
  APPSHOTS_API_BASE,
  DEFAULT_PER_PAGE,
  DEFAULT_SCOPE,
  ENDPOINTS,
  IMAGE_FETCH_TIMEOUT_MS,
  MAX_IMAGE_SIZE_BYTES,
  REQUEST_TIMEOUT_MS,
  REQUIRED_IMAGE_URL_SUBSTRING,
  type Platform,
} from "../constants.js";
import type { AppShotsSearchResponse, PagedResponse, SearchParams } from "../types.js";
import { AppshotsAuth } from "./auth.js";

export interface SearchOptions {
  query?: string;
  platform?: Platform;
  page?: number;
  perPage?: number;
  scope?: string;
  appSlug?: string;
}

export class AppshotsApiClient {
  private auth: AppshotsAuth;

  constructor(auth: AppshotsAuth) {
    this.auth = auth;
  }

  private buildParams(opts: SearchOptions): SearchParams {
    const params: SearchParams = {
      q: opts.query ?? "",
      platform: opts.platform ?? "ios",
      page: opts.page ?? 1,
      per_page: opts.perPage ?? DEFAULT_PER_PAGE,
      scope: opts.scope ?? DEFAULT_SCOPE,
    };
    if (opts.appSlug) params.app_slug = opts.appSlug;
    return params;
  }

  // authed GET, bearer token + query string; returns raw json
  private async request<T = unknown>(
    path: string,
    params: Record<string, unknown> | SearchParams,
  ): Promise<T> {
    const idToken = await this.auth.getIdToken();

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }

    const url = `${APPSHOTS_API_BASE}${path}?${query.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: "application/json",
          Origin: "https://appshots.design",
          Referer: "https://appshots.design/",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `appshots API error: ${res.status} ${res.statusText} - ${path}` +
            (text ? `: ${text.substring(0, 200)}` : ""),
        );
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  searchAppShots(opts: SearchOptions): Promise<AppShotsSearchResponse> {
    return this.request(ENDPOINTS.SEARCH_APP_SHOTS, this.buildParams(opts));
  }

  searchScreenTags(opts: SearchOptions): Promise<PagedResponse> {
    return this.request(ENDPOINTS.SEARCH_SCREEN_TAGS, this.buildParams(opts));
  }

  searchUiComponents(opts: SearchOptions): Promise<PagedResponse> {
    return this.request(ENDPOINTS.SEARCH_UI_COMPONENTS, this.buildParams(opts));
  }

  searchTextInImages(opts: SearchOptions): Promise<PagedResponse> {
    return this.request(ENDPOINTS.SEARCH_TEXT_IN_IMAGES, this.buildParams(opts));
  }

  searchFlows(opts: SearchOptions): Promise<PagedResponse> {
    return this.request(ENDPOINTS.SEARCH_FLOWS, this.buildParams(opts));
  }

  // public storage assets; host-allowlisted so this can't be an ssrf primitive
  async fetchImage(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
    const parsed = new URL(imageUrl);
    // pathname, not the whole url — a query string shouldn't satisfy the bucket check
    if (
      parsed.protocol !== "https:" ||
      !ALLOWED_IMAGE_HOSTS.includes(parsed.hostname) ||
      !parsed.pathname.includes(REQUIRED_IMAGE_URL_SUBSTRING)
    ) {
      throw new Error(
        `Refusing to fetch untrusted image URL: ${imageUrl}. Only appshots Storage screenshot URLs are allowed.`,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
      // redirect:"error" so an allowlisted url can't bounce off-list
      const res = await fetch(imageUrl, { signal: controller.signal, redirect: "error" });
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${imageUrl}`);

      const declared = Number(res.headers.get("content-length"));
      if (declared > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(`Image too large (${declared} bytes): ${imageUrl}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(`Image too large (${buf.byteLength} bytes): ${imageUrl}`);
      }

      const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/webp";
      return { base64: buf.toString("base64"), mimeType };
    } finally {
      clearTimeout(timer);
    }
  }
}
