#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AppshotsAuth } from "./services/auth.js";
import { AppshotsApiClient, type SearchOptions } from "./services/api-client.js";
import {
  formatAppShots,
  formatScreens,
  formatFlows,
  formatTextResults,
  isBlurredUrl,
  titleCase,
} from "./utils/formatting.js";
import { readStoredSession, writeStoredSession } from "./utils/auth-store.js";
import type { PagedResponse } from "./types.js";
import { DEFAULT_PER_PAGE, DEFAULT_SCOPE, MAX_IMAGES_PER_CALL, PLATFORMS } from "./constants.js";

const searchShape = {
  query: z.string().min(1).describe("Search term. Required — an empty query returns nothing."),
  platform: z.enum(PLATFORMS).default("ios").describe("Platform to search"),
  page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(DEFAULT_PER_PAGE)
    .describe(
      "Results per page. Raise it for broader research; flows cap at 20 and " +
        "search_text_in_images always returns 20 regardless.",
    ),
  scope: z.string().default(DEFAULT_SCOPE).describe("Search scope. Non-'global' scopes are plan-gated."),
  app_slug: z.string().optional().describe("Restrict to a single app by its slug."),
};

type SearchArgs = {
  query: string;
  platform: (typeof PLATFORMS)[number];
  page: number;
  per_page: number;
  scope: string;
  app_slug?: string;
};

// tag/component values are matched exactly and case-sensitively server-side
// ("onboarding" → 0 hits, "Onboarding" → 43). the vocabulary is mixed-case
// though ("login" and "Login" are both real tags), so try the query as given
// and title-cased, and keep whichever matched more.
async function screensCaseTolerant(
  search: (o: SearchOptions) => Promise<PagedResponse>,
  a: SearchArgs,
): Promise<PagedResponse> {
  const cased = titleCase(a.query);
  if (cased === a.query) return search(toOptions(a));

  const rows = (r: PagedResponse) => (r.screens as unknown[] | undefined)?.length ?? 0;
  const [asGiven, retitled] = await Promise.all([
    search(toOptions(a)),
    search(toOptions({ ...a, query: cased })),
  ]);
  return rows(retitled) > rows(asGiven) ? retitled : asGiven;
}

function toOptions(a: SearchArgs): SearchOptions {
  return {
    query: a.query,
    platform: a.platform,
    page: a.page,
    perPage: a.per_page,
    scope: a.scope,
    appSlug: a.app_slug,
  };
}

async function main() {
  if (process.argv[2] === "auth") {
    const { runAuthFlow } = await import("./cli/auth.js");
    await runAuthFlow();
    return;
  }

  const stored = readStoredSession();
  if (!stored) {
    console.error(
      "Error: No authentication found.\n\n" +
        "Run 'appshots-mcp auth' to log in (you'll paste your Firebase token\n" +
        "from the browser's localStorage — see the command's instructions).",
    );
    process.exit(1);
  }

  const auth = AppshotsAuth.fromStoredSession(stored, writeStoredSession);
  const client = new AppshotsApiClient(auth);

  const server = new McpServer({
    name: "appshots",
    version: "0.1.0",
    description: "Search and browse appshots.design design inspiration — app screens and flows",
  });

  const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

  server.tool(
    "appshots_search_screens",
    "Search apps and their screens on appshots.design by keyword and platform. " +
      "Returns each app with its screenshot image URLs for design reference. " +
      "A search term (`query`) is required. Matches app names and descriptions, " +
      "so use a product or category term; paginate with `page`.",
    searchShape,
    async (a: SearchArgs) => text(formatAppShots(await client.searchAppShots(toOptions(a)))),
  );

  server.tool(
    "appshots_search_text_in_images",
    "Search for screens containing specific visible/OCR text (e.g., a button label or headline).",
    searchShape,
    async (a: SearchArgs) => text(formatTextResults(await client.searchTextInImages(toOptions(a)))),
  );

  server.tool(
    "appshots_search_by_tag",
    "Search individual screens by a UI-pattern tag. Tags are free-form and matched " +
      "as whole values, so use a real tag name — e.g. Onboarding, Sign Up, Settings, " +
      "Notifications, Subscription, Dashboard, Empty State, Payment, Filter, Map, Home. " +
      "Casing is normalized for you. Broad or unusual terms may return nothing — " +
      "fall back to appshots_search_screens.",
    searchShape,
    async (a: SearchArgs) =>
      text(formatScreens(await screensCaseTolerant((o) => client.searchScreenTags(o), a))),
  );

  server.tool(
    "appshots_search_by_component",
    "Search individual screens by a UI component present on them — e.g. Card, " +
      "Search Bar, Tab Bar, Checkbox, Slider, Badge, Text Field, Avatar, List. " +
      "Casing is normalized for you. Not every component name is indexed; " +
      "fall back to appshots_search_screens if this returns nothing.",
    searchShape,
    async (a: SearchArgs) =>
      text(formatScreens(await screensCaseTolerant((o) => client.searchUiComponents(o), a))),
  );

  server.tool(
    "appshots_search_flows",
    "Search user flows / journeys by keyword and platform. Returns apps with their flow screens.",
    searchShape,
    async (a: SearchArgs) => text(formatFlows(await client.searchFlows(toOptions(a)))),
  );

  // collections endpoints reject the bearer token, so no collections tool for now

  server.tool(
    "appshots_get_screens",
    "Fetch one or more appshots screenshot images and return them as viewable images " +
      "so you can analyze the actual UI (layout, color, components, copy). " +
      "Pass the `img_url` values from any search result. Use this for visual design research.",
    {
      image_urls: z
        .array(z.string().url())
        .min(1)
        .max(MAX_IMAGES_PER_CALL)
        .describe(`Screenshot image URLs from search results (max ${MAX_IMAGES_PER_CALL}).`),
      include_blurred: z
        .boolean()
        .default(false)
        .describe("Blurred free-tier previews are skipped by default. Set true to fetch them anyway."),
    },
    async ({ image_urls, include_blurred }: { image_urls: string[]; include_blurred: boolean }) => {
      const content: Array<
        { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
      > = [];
      let skipped = 0;
      for (const url of image_urls) {
        if (!include_blurred && isBlurredUrl(url)) {
          skipped++;
          continue;
        }
        try {
          const { base64, mimeType } = await client.fetchImage(url);
          content.push({ type: "image", data: base64, mimeType });
        } catch (err) {
          content.push({ type: "text", text: `⚠️ ${(err as Error).message}` });
        }
      }
      if (skipped > 0) {
        content.push({
          type: "text",
          text: `(skipped ${skipped} blurred free-tier preview${skipped > 1 ? "s" : ""} — pass include_blurred:true to fetch anyway)`,
        });
      }
      if (content.length === 0) {
        content.push({ type: "text", text: "No viewable images (all were blurred free-tier previews)." });
      }
      return { content };
    },
  );

  server.tool(
    "appshots_whoami",
    "Show the authenticated appshots account (email, name, user id) and token expiry.",
    {},
    async () => {
      await auth.getIdToken(); // refresh first so the claims/expiry aren't stale
      const c = auth.getClaims();
      const s = auth.getSession();
      const exp = typeof c.exp === "number" ? new Date(c.exp * 1000).toISOString() : "unknown";
      return text(
        [
          `Account: ${c.name ?? "(unknown)"} <${c.email ?? s.email ?? "unknown"}>`,
          `User ID: ${c.user_id ?? s.uid ?? "unknown"}`,
          `Token expires: ${exp} (auto-refreshed)`,
          "",
          "No endpoint exposes the plan (free vs PRO), and no per-page cap was observed",
          "on this account — `per_page` is honored up to the number of matches.",
        ].join("\n"),
      );
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("appshots-mcp server running on stdio.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
