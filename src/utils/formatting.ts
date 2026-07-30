import type { AppShot, PagedResponse, Screen } from "../types.js";

// free-tier previews come from a /blur/ path; we flag and skip them
export function isBlurredUrl(url = ""): boolean {
  return url.includes("/blur/");
}

const BLUR_TAG = " ⧗ blurred (free-tier preview — upgrade to view)";

function pageFooter(res: PagedResponse): string {
  const { current_page: cur, total_pages: tot, total_count: count } = res;
  if (cur === undefined && tot === undefined && count === undefined) return "";
  const parts: string[] = [];
  if (count !== undefined) parts.push(`${count} total`);
  if (cur !== undefined && tot !== undefined) parts.push(`page ${cur}/${tot}`);
  if (res.has_next) parts.push("more available — increment `page`");
  return `\n\n_(${parts.join(" · ")})_`;
}

function screenLines(screens: Screen[] | undefined, indent = "   "): string {
  if (!screens?.length) return "";
  return screens
    .map((s) => {
      const tags = s.tags?.length ? ` [${s.tags.join(", ")}]` : "";
      const blur = isBlurredUrl(s.img_url) ? BLUR_TAG : "";
      return `${indent}- ${s.img_url ?? "(no url)"}${tags}${blur}`;
    })
    .join("\n");
}

export function formatAppShots(res: PagedResponse): string {
  const apps = (res.app_shots as AppShot[] | undefined) ?? [];
  if (!apps.length) return "No results." + pageFooter(res);

  const blocks = apps.map((app, i) => {
    const platforms = app.platforms?.length ? ` — ${app.platforms.join(", ")}` : "";
    const desc = app.short_description ? `\n   ${app.short_description}` : "";
    const dev = app.developer ? ` · ${app.developer}` : "";
    const header = `${i + 1}. **${app.app_name ?? "(unknown)"}**${platforms}${dev}`;
    const slug = app.slug ? `\n   slug: ${app.slug}` : "";
    const screens = app.screens?.length ? `\n   screens (${app.screens.length}):\n${screenLines(app.screens)}` : "";
    return header + desc + slug + screens;
  });

  return `Found ${apps.length} app(s):\n\n${blocks.join("\n\n")}` + pageFooter(res);
}

export function formatScreens(res: PagedResponse): string {
  const screens = (res.screens as Screen[] | undefined) ?? [];
  if (!screens.length) return "No results." + pageFooter(res);
  const lines = screens.map((s, i) => {
    const tags = s.tags?.length ? `\n   [${s.tags.join(", ")}]` : "";
    const plat = s.platform ? ` (${s.platform})` : "";
    const app = s.app_name ? `**${s.app_name}** — ` : "";
    const desc = s.description ? `\n   ${s.description}` : "";
    const blur = isBlurredUrl(s.img_url) ? BLUR_TAG : "";
    return `${i + 1}. ${app}${s.img_url ?? "(no url)"}${plat}${blur}${desc}${tags}`;
  });
  return `Found ${screens.length} screen(s):\n\n${lines.join("\n")}` + pageFooter(res);
}

export function formatFlows(res: PagedResponse): string {
  const flows = (res.appflow_appShots as AppShot[] | undefined) ?? [];
  if (!flows.length) return "No results." + pageFooter(res);
  const blocks = flows.map((app, i) => {
    const header = `${i + 1}. **${app.app_name ?? "(unknown)"}**`;
    const screens = app.screens?.length ? `\n   screens (${app.screens.length}):\n${screenLines(app.screens)}` : "";
    return header + screens;
  });
  return `Found ${flows.length} flow(s):\n\n${blocks.join("\n\n")}` + pageFooter(res);
}

// text-in-images has no pagination envelope
export function formatTextResults(res: PagedResponse): string {
  const results = (res.results as unknown[] | undefined) ?? [];
  if (!results.length) return "No results.";
  return `Found ${results.length} match(es):\n\n\`\`\`json\n${clip(JSON.stringify(results, null, 2))}\n\`\`\``;
}

function clip(text: string, max = 8000): string {
  return text.length > max ? text.slice(0, max) + "\n… (truncated)" : text;
}
