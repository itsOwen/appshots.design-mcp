# appshots-mcp

Unofficial MCP server for [appshots.design](https://appshots.design). Lets Claude search the library and actually look at the screenshots, so it can pull real design references instead of guessing.

appshots has no public API — this talks to their backend (`be.appshots.design`) using your own account's Firebase session. You get back whatever your account can see.

## tools

- `appshots_search_screens` — search apps + their screens by keyword
- `appshots_search_flows` — search user flows
- `appshots_search_by_tag` — screens by UI pattern (Onboarding, Settings, Paywall…)
- `appshots_search_by_component` — screens by component (Card, Search Bar, Tab Bar…)
- `appshots_search_text_in_images` — find text inside screenshots
- `appshots_get_screens` — fetch screenshots as actual images Claude can see
- `appshots_whoami` — which account is connected

Search tools take `query`, `platform` (ios/android/web), `page`, `per_page`, `scope`. `get_screens` takes the `img_url`s from any search result and returns them as images. It skips blurred free-tier previews by default.

## setup

Need node 18+ and an appshots account (free is fine).

```bash
pnpm install
pnpm run build
node dist/index.js auth
```

`pnpm test` runs the offline checks (url guard, formatters, token parsing) — no account needed.

The auth command tells you to log into appshots, open the browser console, and run:

```js
copy(localStorage['firebase:authUser:AIzaSyD0RRt1ciOD-6JZ2RfACtM0FkHc6w4ZXeg:[DEFAULT]'])
```

Paste that at the prompt. Token saves to `~/.appshots-mcp/auth.json` and refreshes itself after.

## clients

This is a plain stdio MCP server, so it works with any MCP client, not just Claude. Point whatever you use at `node /absolute/path/to/appshots-mcp/dist/index.js`.

Claude Code:

```bash
claude mcp add appshots -- node /absolute/path/to/appshots-mcp/dist/index.js
```

Codex CLI:

```bash
codex mcp add appshots -- node /absolute/path/to/appshots-mcp/dist/index.js
```

Claude Desktop / Cursor / Cline / Windsurf / anything using the `mcpServers` JSON format:

```json
{
  "mcpServers": {
    "appshots": {
      "command": "node",
      "args": ["/absolute/path/to/appshots-mcp/dist/index.js"]
    }
  }
}
```

Restart / reconnect the client and the tools show up. Auth is shared — it reads the same `~/.appshots-mcp/auth.json` no matter which client runs it.

## how it works

appshots is a Nuxt app on Firebase. Every request carries your Firebase id token as a bearer header; it expires hourly and gets refreshed off the refresh token against Google's securetoken endpoint. Search hits the `_es` (elasticsearch) routes. Screenshots are public storage URLs — `get_screens` fetches them (host-allowlisted so it can't be pointed anywhere else) and hands them back as base64 for the model to look at.

## use case

The point is grounded design research. Instead of one-shotting a design, have Claude look at what real apps do first. Example prompt:

> Research how top apps handle onboarding for a fintech app. Search for the relevant screens and flows, fetch the best ones as images, compare the patterns across products, and write me an HTML report with the actual screenshots embedded and notes on what the best apps do differently.

Claude searches, pulls the screens as images, reasons over the real UI, and gives you a report grounded in shipped products — then you take that into whatever you're building.

## notes

- `per_page` defaults to 20 and is honored up to the number of matches — no free-tier cap showed up in testing. `search_flows` caps at 20 and `search_text_in_images` always returns 20 regardless of what you pass.
- if a screen ever comes back as a blurred `/blur/` preview, `get_screens` skips it unless you pass `include_blurred: true`.
- `search_by_tag` / `search_by_component` match whole tag values and the backend is case-sensitive; the server retries your query title-cased, so `onboarding` finds `Onboarding`. tags are free-form, so obscure terms still miss — fall back to `search_screens`.
- appshots can change these endpoints whenever. it surfaces errors instead of hiding them.

## license

ISC
