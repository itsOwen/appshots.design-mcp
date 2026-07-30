// offline checks — no auth, no network. run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { AppshotsApiClient } from "./dist/services/api-client.js";
import { AppshotsAuth } from "./dist/services/auth.js";
import {
  isBlurredUrl,
  titleCase,
  formatAppShots,
  formatScreens,
  formatFlows,
  formatTextResults,
} from "./dist/utils/formatting.js";

const OK = "https://firebasestorage.googleapis.com/v0/b/appshots-design.appspot.com/o/x.webp?alt=media";
const client = new AppshotsApiClient(null); // guard runs before auth is touched

test("fetchImage guard rejects anything but appshots storage urls", async () => {
  const bad = [
    "https://evil.com/x.png", // wrong host
    "https://firebasestorage.googleapis.com@evil.com/x.png", // userinfo trick
    "https://firebasestorage.googleapis.com/v0/b/other-bucket/o/x.webp", // wrong bucket
    "https://firebasestorage.googleapis.com/x.png?b=appshots-design.appspot.com", // bucket only in query
    "http://firebasestorage.googleapis.com/v0/b/appshots-design.appspot.com/o/x.webp", // plaintext
    "http://169.254.169.254/latest/meta-data/", // link-local
    "file:///etc/passwd",
  ];
  for (const url of bad) {
    await assert.rejects(() => client.fetchImage(url), /Refusing to fetch|Invalid URL/, url);
  }
});

test("fetchImage guard accepts a real storage url", async () => {
  // must get past the guard — a network failure here means the guard let it through
  await assert.rejects(() => client.fetchImage(OK), (e) => !/Refusing to fetch/.test(e.message));
});

test("blur detection", () => {
  assert.equal(isBlurredUrl(OK.replace("/o/", "/o/blur/")), true);
  // storage urls percent-encode the path separators
  assert.equal(isBlurredUrl("https://x/o/screens%2Fblur%2Fy.webp"), true);
  assert.equal(isBlurredUrl(OK), false);
  assert.equal(isBlurredUrl("https://x/o/screens%2Fblurb%2Fy.webp"), false);
  assert.equal(isBlurredUrl(undefined), false);
  assert.equal(isBlurredUrl("https://x/%E0%A4%A"), false); // malformed escape must not throw
});

test("titleCase normalizes any casing to the indexed form", () => {
  assert.equal(titleCase("onboarding"), "Onboarding");
  assert.equal(titleCase("ONBOARDING"), "Onboarding"); // all-caps must not pass through
  assert.equal(titleCase("search bar"), "Search Bar");
  assert.equal(titleCase("sign-up"), "Sign-Up");
  assert.equal(titleCase("Empty State"), "Empty State");
});

test("formatters handle empty and populated responses", () => {
  assert.match(formatAppShots({}), /No results/);
  assert.match(formatScreens({}), /No results/);
  assert.match(formatFlows({}), /No results/);
  assert.match(formatTextResults({}), /No results/);

  const out = formatAppShots({
    total_count: 42,
    current_page: 1,
    total_pages: 7,
    has_next: true,
    app_shots: [
      {
        app_name: "Linear",
        platforms: ["ios"],
        slug: "linear",
        screens: [{ img_url: OK, tags: ["onboarding"] }, { img_url: "https://x/blur/y.webp" }],
      },
    ],
  });
  assert.match(out, /Linear/);
  assert.match(out, /onboarding/);
  assert.match(out, /blurred/); // blur tag rendered
  assert.match(out, /42 total · page 1\/7 · more available/);

  assert.match(formatScreens({ screens: [{ img_url: OK, platform: "ios" }] }), /ios/);
  assert.match(formatFlows({ appflow_appShots: [{ app_name: "Duolingo" }] }), /Duolingo/);
});

test("formatTextResults truncates runaway payloads", () => {
  const out = formatTextResults({ results: [{ blob: "x".repeat(20000) }] });
  assert.match(out, /truncated/);
  assert.ok(out.length < 9000);
});

test("jwt claims decode, and garbage degrades to empty", () => {
  const payload = Buffer.from(JSON.stringify({ email: "a@b.c", exp: 123 })).toString("base64url");
  const auth = AppshotsAuth.fromStoredSession({
    idToken: `h.${payload}.s`,
    refreshToken: "r",
    expirationTime: Date.now() + 3600_000,
  });
  assert.equal(auth.getClaims().email, "a@b.c");

  const broken = AppshotsAuth.fromStoredSession({ idToken: "nope", refreshToken: "r", expirationTime: 0 });
  assert.deepEqual(broken.getClaims(), {});
});

test("auth blob parsing rejects a token-less paste", () => {
  assert.throws(() => AppshotsAuth.fromFirebaseAuthUser("{}"), /stsTokenManager/);
  assert.throws(() => AppshotsAuth.fromFirebaseAuthUser("not json"), /JSON|Unexpected/);

  const auth = AppshotsAuth.fromFirebaseAuthUser(
    JSON.stringify({
      uid: "u1",
      email: "a@b.c",
      stsTokenManager: { accessToken: "at", refreshToken: "rt", expirationTime: 999 },
    }),
  );
  assert.equal(auth.getSession().refreshToken, "rt");
  assert.equal(auth.getSession().email, "a@b.c");
});
