// @vitest-environment node
//
// Node, not jsdom: this test imports the real svelte.config.js, which pulls in
// @sveltejs/adapter-netlify and therefore esbuild — and esbuild refuses to load
// under jsdom ("new TextEncoder().encode('') instanceof Uint8Array is
// incorrectly false", a cross-realm Uint8Array). Asserting against the actual
// exported config is the whole point; a hand-copied policy would prove nothing.
import { describe, it, expect } from "vitest";
import { SVELTE_EVENT_REPLAY_HASH } from "@reddoorla/maintenance/configs/svelte";

import { DEFAULT_MAP_STYLE_URL, MAP_TILE_HOST } from "../src/lib/property-map";

// The served policy is asserted where it is authored. Svelte 5 server-renders
// `onload="this.__e=event"` (and onerror) on every element that takes an
// attribute spread — i.e. every `<img {...getImageProps(field)} />` the Prismic
// helpers produce — as its replay stub for a load/error that fires before
// hydration. A nonce never covers an event-handler ATTRIBUTE, so without both
// 'unsafe-hashes' and the stub's own hash the browser refuses to run it: the
// pre-hydration load is dropped and one violation is POSTed to /api/csp-report
// per image, per page view (12 on `/` alone, measured on beachfront-dentistry
// 2026-08-13), burying real violations under the noise.
type CspConfig = {
  kit?: { csp?: { directives?: Record<string, string[]> } };
};
const { default: config } = (await import("../svelte.config.js")) as unknown as {
  default: CspConfig;
};
const scriptSrc = config.kit?.csp?.directives?.["script-src"] ?? [];
const connectSrc = config.kit?.csp?.directives?.["connect-src"] ?? [];
const directives = config.kit?.csp?.directives ?? {};

describe("the template's Content-Security-Policy", () => {
  it("allows Svelte's SSR event-replay stub by its exact hash", () => {
    expect(scriptSrc).toContain("unsafe-hashes");
    expect(scriptSrc).toContain(SVELTE_EVENT_REPLAY_HASH);
  });

  // 'unsafe-hashes' widens hash matching to event handlers and nothing else, so
  // only that one-liner is allowed. Paired with 'unsafe-inline' the guarantee
  // is gone — every injected inline script would run too.
  it("never pairs that with 'unsafe-inline'", () => {
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  // The hash is imported, never transcribed: a copied string cannot be told
  // apart from a stale one, and the stub's text is upstream's to change.
  it("takes the hash from the shared config package, not a local copy", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../svelte.config.js", import.meta.url), "utf-8"),
    );
    expect(source).toContain("SVELTE_EVENT_REPLAY_HASH");
    expect(source).not.toContain(SVELTE_EVENT_REPLAY_HASH);
  });

  // The property map (#13) is one host in one directive, and this is the test
  // that says so out loud — the policy is where a map silently stops working,
  // and "the map looks fine on my machine" is not evidence about a header.
  describe("the property map's tile provider", () => {
    it("is allowed in connect-src and NOWHERE else", () => {
      expect(connectSrc).toContain(MAP_TILE_HOST);
      for (const [name, values] of Object.entries(directives)) {
        if (name === "connect-src") continue;
        expect(values, `${name} should not need the tile host`).not.toContain(MAP_TILE_HOST);
      }
    });

    // THE STYLE DOCUMENT MOVED TO OUR OWN ORIGIN (2026-09-22,
    // scripts/map-style.mjs), and MapLibre fetches it — so `'self'` in
    // connect-src is now load-bearing for the map as well as for /api/*.
    // Without this case, deleting `'self'` from connect-src would leave every
    // assertion in this file green and the map dead in production: the tile
    // host above would still be listed, and nothing else here reads the
    // directive at all.
    it("allows the same-origin style document the map now loads", () => {
      expect(DEFAULT_MAP_STYLE_URL.startsWith("/")).toBe(true);
      expect(connectSrc).toContain("self");
    });

    // MapLibre 6 compiles style expressions without `eval`/`new Function`, and
    // its worker is same-origin (see $lib/map-engine), so neither of the two
    // escape hatches a map is usually asked for may appear.
    it("costs neither 'unsafe-eval' nor a blob: worker", () => {
      expect(scriptSrc).not.toContain("unsafe-eval");
      expect(scriptSrc).not.toContain("blob:");
      expect(directives["worker-src"]).toBeUndefined();
      expect(directives["child-src"]).toBeUndefined();
    });
  });
});
