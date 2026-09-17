// @vitest-environment node
//
// Node, not jsdom: this test imports the real svelte.config.js, which pulls in
// @sveltejs/adapter-netlify and therefore esbuild — and esbuild refuses to load
// under jsdom ("new TextEncoder().encode('') instanceof Uint8Array is
// incorrectly false", a cross-realm Uint8Array). Asserting against the actual
// exported config is the whole point; a hand-copied policy would prove nothing.
import { describe, it, expect } from "vitest";
import { SVELTE_EVENT_REPLAY_HASH } from "@reddoorla/maintenance/configs/svelte";

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
});
