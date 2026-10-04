import { describe, it, expect } from "vitest";
import {
  cspAdmits,
  deriveBuildServices,
  maskComments,
  startsAnalytics,
  withRuntime,
  type BuildServices,
  type SourceFile,
} from "./services";

const src = (path: string, text: string): SourceFile => ({ path, text });

const CSP = {
  "script-src": ["self", "https://challenges.cloudflare.com"],
  "style-src": ["self", "unsafe-inline", "https://fonts.googleapis.com", "https://use.typekit.net"],
  "frame-src": ["self", "https://player.vimeo.com", "https://www.youtube.com"],
  "font-src": ["self", "https://fonts.gstatic.com"],
  "report-uri": ["https://player.vimeo.com/should-not-count"],
};

const HOOK = src(
  "src/hooks.client.ts",
  `import { initAnalytics } from "@reddoorla/maintenance/client";
export const init = () => {
  initAnalytics({
    measurementId: "G-ABCDEFGHIJ",
    productionHost: "example.com",
  });
};`,
);

const CONTACT = src(
  "src/routes/contact/+page.server.ts",
  `export const actions = { default: createIngestAction({ formType: "contact" }) };`,
);

const derive = (sources: SourceFile[], csp: Record<string, unknown> | null = CSP) =>
  deriveBuildServices({ csp, adapterName: "@sveltejs/adapter-netlify", sources });

describe("startsAnalytics", () => {
  it("finds the analytics-tag recipe's hook", () => {
    expect(startsAnalytics(HOOK.text)).toBe(true);
  });

  it("finds an ID read from env, nested options, a gtag loader and a GTM container", () => {
    expect(startsAnalytics(`initAnalytics({ measurementId: env.PUBLIC_GA_ID })`)).toBe(true);
    expect(startsAnalytics(`initAnalytics({ consent: { ad: false }, measurementId: "G-X" })`)).toBe(
      true,
    );
    expect(startsAnalytics(`"https://www.googletagmanager.com/gtag/js?id=G-ZYXWVUTSRQ"`)).toBe(
      true,
    );
    expect(startsAnalytics(`"https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"`)).toBe(true);
  });

  it("does not take a site's own definition of initAnalytics for a call", () => {
    expect(startsAnalytics(`export function initAnalytics(id: string) {}`)).toBe(false);
  });

  it("does not take a mention of the package for a call", () => {
    expect(startsAnalytics(`import { initAnalytics } from "@reddoorla/maintenance/client";`)).toBe(
      false,
    );
  });
});

describe("maskComments", () => {
  it("keeps URLs inside strings while dropping line comments", () => {
    const out = maskComments(`const a = "https://player.vimeo.com"; // https://use.typekit.net`);
    expect(out).toContain("https://player.vimeo.com");
    expect(out).not.toContain("typekit");
  });

  it("drops a block comment in script", () => {
    const out = maskComments(`const a = 1; /* "https://use.typekit.net" */ const b = 2;`);
    expect(out).not.toContain("typekit");
    expect(out).toContain("const b = 2;");
  });

  it("keeps an escaped quote inside a string from ending it", () => {
    const out = maskComments(`const a = "x\\" // y"; const u = "https://player.vimeo.com";`);
    expect(out).toContain("https://player.vimeo.com");
  });

  it("closes an unterminated quote at the end of its line", () => {
    const out = maskComments(`const a = "open\n// https://use.typekit.net\nconst b = 1;`);
    expect(out).not.toContain("typekit");
  });

  it("keeps a protocol-relative url() in CSS and drops CSS comments", () => {
    const out = maskComments(
      `@import url(//fonts.googleapis.com/css2); /* use.typekit.net */`,
      "src/app.css",
    );
    expect(out).toContain("fonts.googleapis.com");
    expect(out).not.toContain("typekit");
  });

  it("keeps a protocol-relative url() inside a component's style block", () => {
    const out = maskComments(
      `<style>@import url(//fonts.googleapis.com/css2);</style>`,
      "src/routes/+layout.svelte",
    );
    expect(out).toContain("fonts.googleapis.com");
  });

  it("drops an HTML comment even after an apostrophe in markup", () => {
    const out = maskComments(
      `<p>We'll reply</p> <!-- https://use.typekit.net/x.css --> <p>ok</p>`,
      "src/routes/x/+page.svelte",
    );
    expect(out).not.toContain("typekit");
    expect(out).toContain("<p>ok</p>");
  });
});

describe("cspAdmits", () => {
  const FRAME = ["frame-src", "child-src", "default-src"];

  it("matches exact hosts, wildcards and scheme-only sources", () => {
    expect(cspAdmits(CSP, "player.vimeo.com", FRAME)).toBe(true);
    expect(cspAdmits({ "frame-src": ["https://*.vimeo.com"] }, "player.vimeo.com", FRAME)).toBe(
      true,
    );
    expect(cspAdmits({ "frame-src": ["https:"] }, "www.youtube.com", FRAME)).toBe(true);
    expect(cspAdmits({ "frame-src": ["'self'"] }, "player.vimeo.com", FRAME)).toBe(false);
    expect(cspAdmits({ "frame-src": ["https://notvimeo.com"] }, "player.vimeo.com", FRAME)).toBe(
      false,
    );
  });

  it("does not let a wildcard admit its own bare host", () => {
    expect(
      cspAdmits({ "frame-src": ["https://*.player.vimeo.com"] }, "player.vimeo.com", FRAME),
    ).toBe(false);
  });

  it("reads only the directive that governs the request, with CSP's fallback", () => {
    expect(cspAdmits({ "img-src": ["https:"] }, "player.vimeo.com", FRAME)).toBe(false);
    expect(
      cspAdmits({ "report-uri": ["https://player.vimeo.com"] }, "player.vimeo.com", FRAME),
    ).toBe(false);
    expect(cspAdmits({ "default-src": ["https:"] }, "player.vimeo.com", FRAME)).toBe(true);
    expect(
      cspAdmits(
        { "frame-src": ["self"], "default-src": ["https://player.vimeo.com"] },
        "player.vimeo.com",
        FRAME,
      ),
    ).toBe(false);
  });
});

describe("deriveBuildServices", () => {
  it("turns GA4 on only when the site's code starts analytics", () => {
    expect(derive([HOOK]).ga4).toBe(true);
    expect(derive([CONTACT]).ga4).toBe(false);
  });

  it("does not take GA4 from a CSP that merely admits Google's hosts", () => {
    const csp = { ...CSP, "script-src": ["https://www.googletagmanager.com"] };
    expect(derive([], csp).ga4).toBe(false);
  });

  it("turns forms on for a route that forwards to the central ingest, action or endpoint", () => {
    expect(derive([CONTACT]).forms).toBe(true);
    expect(
      derive([src("src/routes/api/x/+server.ts", `export const POST = createIngestEndpoint({});`)])
        .forms,
    ).toBe(true);
    expect(derive([HOOK]).forms).toBe(false);
  });

  it("finds a newsletter whose formType is set in the component that posts it", () => {
    const endpoint = src(
      "src/routes/api/forms/+server.ts",
      `export const POST = createIngestEndpoint({ buildPayload: (b) => ({ formType: b.formType }) });`,
    );
    const signup = src(
      "src/lib/NewsletterSignup.svelte",
      `<script>submitForm({ "formType": "newsletter" });</script>`,
    );
    expect(derive([endpoint, signup]).newsletter).toBe(true);
    expect(derive([signup]).newsletter).toBe(false);
  });

  it("turns the newsletter on only for a newsletter form", () => {
    expect(derive([CONTACT]).newsletter).toBe(false);
    const signup = src(
      "src/routes/api/newsletter/+server.ts",
      `export const POST = createIngestEndpoint({ formType: "newsletter" });`,
    );
    expect(derive([signup])).toMatchObject({ forms: true, newsletter: true });
  });

  it("does not list a video host the CSP blocks, even when the source names it", () => {
    const yt = src("src/lib/Embed.svelte", `"https://www.youtube.com/embed/x"`);
    expect(derive([yt], { "frame-src": ["self"] }).youtube).toBe(false);
  });

  it("lists a video host whenever the CSP admits it, since CMS content can embed it", () => {
    expect(derive([])).toMatchObject({ vimeo: true, youtube: true });
    expect(derive([], { "frame-src": ["self"] })).toMatchObject({ vimeo: false, youtube: false });
  });

  it("lists a video host from the source alone when the site sets no CSP", () => {
    const yt = src("src/lib/Embed.svelte", `"https://www.youtube.com/embed/x"`);
    expect(derive([yt], null)).toMatchObject({ youtube: true, vimeo: false });
  });

  it("lists a font host only when the source loads it and the CSP admits it", () => {
    const fonts = src(
      "src/app.html",
      `<link href="https://fonts.googleapis.com/css2?family=Inter">`,
    );
    expect(derive([]).googleFonts).toBe(false);
    expect(derive([fonts]).googleFonts).toBe(true);
    expect(derive([fonts], { "style-src": ["self"] }).googleFonts).toBe(false);
    expect(derive([fonts], null).googleFonts).toBe(true);
  });

  it("ignores a font host named only in a comment", () => {
    const commented = src("src/app.html", `<!-- https://use.typekit.net/abc.css -->`);
    expect(derive([commented]).adobeFonts).toBe(false);
    const live = src("src/app.html", `<link href="https://use.typekit.net/abc.css">`);
    expect(derive([live]).adobeFonts).toBe(true);
  });

  it("names Netlify from the adapter the site builds with", () => {
    expect(derive([]).netlify).toBe(true);
    expect(
      deriveBuildServices({ csp: CSP, adapterName: "@sveltejs/adapter-node", sources: [] }).netlify,
    ).toBe(false);
  });
});

describe("withRuntime", () => {
  const base = derive([]) as BuildServices;

  it("lists Turnstile only when the site has a form and a sitekey", () => {
    const withForms = { ...base, forms: true };
    expect(withRuntime(withForms, { turnstileSiteKey: "0x4AAA" }).turnstile).toBe(true);
    expect(withRuntime(withForms, { turnstileSiteKey: "  " }).turnstile).toBe(false);
    expect(withRuntime({ ...base, forms: false }, { turnstileSiteKey: "0x4AAA" }).turnstile).toBe(
      false,
    );
  });
});

describe("the property map's tile host", () => {
  const map = src(
    "src/lib/property-map.ts",
    `export const MAP_TILE_HOST = "https://tiles.openfreemap.org";`,
  );

  it("is listed when the code loads tiles from it and connect-src admits it", () => {
    expect(
      derive([map], { "connect-src": ["self", "https://tiles.openfreemap.org"] }).openFreeMap,
    ).toBe(true);
  });

  it("is not listed when connect-src blocks it, or when no code loads it", () => {
    expect(derive([map], { "connect-src": ["self"] }).openFreeMap).toBe(false);
    expect(derive([], { "connect-src": ["https://tiles.openfreemap.org"] }).openFreeMap).toBe(
      false,
    );
  });
});
