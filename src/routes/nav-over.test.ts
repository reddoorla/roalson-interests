import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { CANVAS_TOP_COLORS } from "$lib/canvas-top";

/**
 * The bar floats — transparent, white wordmark, dust controls — only over a
 * dark first band, and it learns that from the ROUTE (`navOver: "dark"` in its
 * page data), because the layout renders the bar before it has seen the page.
 * That is a claim made in one file about markup in another, so nothing but
 * this test holds the two together:
 *
 *  - a route that opens on a dark band and does not say so gets the solid bar
 *    AND the layout's top padding — an off-white strip above its masthead;
 *  - a route that says so and opens on anything else gets a white wordmark on
 *    an off-white page, which is no wordmark at all.
 *
 * "Opens on" is read from the page's markup: the first element or component
 * after the script block. Add a component to DARK_FIRST_BANDS when it is built
 * to run under the bar.
 *
 * HomeHero is the second, and the one this test cannot fully vouch for: its
 * band is CMS content, and a first tag says nothing about whether the band
 * renders. The home route answers that itself — it lifts the hero out of the
 * document's slices and renders <HomeHero> first and unconditionally, and with
 * no slice the component still paints its dark 528px ground (asserted in
 * HomeHero.test.ts and, in a browser, by tests/interaction/home-hero.spec.ts).
 * The last test below holds the "unconditionally": {#if} is not a tag, so a
 * band wrapped in one still reads as the first tag.
 */
const DARK_FIRST_BANDS = ["PageMasthead", "HomeHero"];

const ROUTES = resolve(process.cwd(), "src/routes");

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "+page.svelte" ? [full] : [];
  });
}

/** A page's markup: scripts, comments and <svelte:head> removed. */
function markup(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svelte:head>[\s\S]*?<\/svelte:head>/g, "");
}

/** The first tag a page renders: scripts, comments and Svelte blocks skipped. */
function firstTag(source: string): string | undefined {
  return /<([A-Za-z][\w.:-]*)/.exec(markup(source))?.[1];
}

/** True when a Svelte block ({#if}, {#each}, {#await}…) opens before the first
 *  tag — i.e. the first band is conditional, whatever its name. */
function firstTagIsConditional(source: string): boolean {
  const text = markup(source);
  const tagAt = text.search(/<[A-Za-z]/);
  return tagAt !== -1 && text.slice(0, tagAt).includes("{#");
}

function claimsDark(page: string): boolean {
  return ["+page.server.ts", "+page.ts"]
    .map((name) => join(dirname(page), name))
    .filter((file) => existsSync(file))
    .some((file) => /navOver:\s*"dark"/.test(readFileSync(file, "utf8")));
}

const all = pages(ROUTES).map((file) => ({
  route: relative(ROUTES, dirname(file)) || "/",
  first: firstTag(readFileSync(file, "utf8")),
  conditional: firstTagIsConditional(readFileSync(file, "utf8")),
  claims: claimsDark(file),
}));

describe("navOver — the route's claim about its first band", () => {
  it("finds the pages, and at least one that opens on a dark band", () => {
    expect(all.length).toBeGreaterThan(3);
    expect(all.filter((p) => p.first && DARK_FIRST_BANDS.includes(p.first)).length).toBeGreaterThan(
      0,
    );
  });

  it("every route that opens on a dark band says so", () => {
    const silent = all.filter((p) => p.first && DARK_FIRST_BANDS.includes(p.first) && !p.claims);
    expect(silent.map((p) => p.route)).toEqual([]);
  });

  it("every route that says so opens on a dark band", () => {
    const wrong = all.filter((p) => p.claims && !(p.first && DARK_FIRST_BANDS.includes(p.first)));
    expect(wrong.map((p) => `${p.route} opens on <${p.first}>`)).toEqual([]);
  });

  // The claim is a literal, made before the page has any data — so the band it
  // describes may not depend on data either. A first band inside {#if hero}
  // passes both tests above and is a white wordmark on an off-white page the
  // day the condition is false.
  it("every route that says so renders that band unconditionally", () => {
    const conditional = all.filter((p) => p.claims && p.conditional);
    expect(conditional.map((p) => `${p.route} opens on <${p.first}> inside a block`)).toEqual([]);
  });
});

/**
 * The same kind of claim, about the other end of the page: the HOMEPAGE's
 * footer grades from off-white to sand (`footerGround: "fade"`, Footer.svelte)
 * and every other page's is flat sand. The footer batch typed the key and the
 * hero batch built the route, in parallel, and the review of the second found
 * that neither had made the claim — nothing failed, the homepage would simply
 * have shipped with the wrong ground. A route that opens on the homepage's hero
 * claims it; nothing else does, except the footer's own fixture.
 */
describe("footerGround — only the homepage's footer fades", () => {
  const claimsFade = (page: string) =>
    ["+page.server.ts", "+page.ts"]
      .map((name) => join(dirname(page), name))
      .filter((file) => existsSync(file))
      .some((file) => /footerGround:\s*"fade"/.test(readFileSync(file, "utf8")));

  const routes = pages(ROUTES).map((file) => ({
    route: relative(ROUTES, dirname(file)) || "/",
    first: firstTag(readFileSync(file, "utf8")),
    fades: claimsFade(file),
  }));

  it("every route that opens on the homepage's hero claims the fade", () => {
    const home = routes.filter((p) => p.first === "HomeHero");
    expect(home.length, "no route opens on HomeHero").toBeGreaterThan(0);
    expect(home.filter((p) => !p.fades).map((p) => p.route)).toEqual([]);
  });

  it("no other route does, except the footer's own fixture", () => {
    const others = routes.filter((p) => p.fades && p.first !== "HomeHero").map((p) => p.route);
    expect(others).toEqual(["dev/footer"]);
  });
});

/**
 * And a third: ON THE HOMEPAGE ONLY the bar has no wordmark until the hero's RI
 * cutout has scrolled away (`navWordmark: "gated"`, operator call 8, #18). "Only
 * the homepage" is the half of that call nothing else can hold: Nav measures a
 * `[data-nav-gate]` element, and a route that claims the gate without one
 * simply gets its wordmark back after mount — so a claim made everywhere would
 * look right in every hydrated browser, and cost every page its wordmark in the
 * server's markup (and, script on and bundle missing, for good). A route that
 * opens on the homepage's hero claims it; nothing else does; and the layout
 * hands the bar the ROUTE's claim, not one of its own.
 */
describe("navWordmark — only the homepage gates the bar's wordmark", () => {
  const claimsGate = (page: string) =>
    ["+page.server.ts", "+page.ts"]
      .map((name) => join(dirname(page), name))
      .filter((file) => existsSync(file))
      .some((file) => /navWordmark:\s*"gated"/.test(readFileSync(file, "utf8")));

  const routes = pages(ROUTES).map((file) => ({
    route: relative(ROUTES, dirname(file)) || "/",
    first: firstTag(readFileSync(file, "utf8")),
    gates: claimsGate(file),
  }));

  it("every route that opens on the homepage's hero claims the gate", () => {
    const home = routes.filter((p) => p.first === "HomeHero");
    expect(home.length, "no route opens on HomeHero").toBeGreaterThan(0);
    expect(home.filter((p) => !p.gates).map((p) => p.route)).toEqual([]);
  });

  it("no other route does", () => {
    expect(routes.filter((p) => p.gates && p.first !== "HomeHero").map((p) => p.route)).toEqual([]);
  });

  it("the layout hands the bar the route's claim, as a prop of its own", () => {
    const layout = readFileSync(join(ROUTES, "+layout.svelte"), "utf8");
    const nav = /<Nav\b[\s\S]*?\/>/.exec(layout)?.[0] ?? "";
    expect(nav).toContain("over={page.data.navOver}");
    expect(nav).toContain("wordmark={page.data.navWordmark}");
    // One `wordmark=`, and it is that one: a literal beside it would win or
    // lose by attribute order, and either way the claim is no longer the route's.
    expect(nav.match(/\bwordmark=/g)).toHaveLength(1);
  });

  it("the element the homepage's bar waits for is HomeHero's band", () => {
    const hero = readFileSync(
      resolve(process.cwd(), "src/lib/slices/HomeHero/index.svelte"),
      "utf8",
    );
    expect(markup(hero)).toMatch(/<div\s+data-nav-gate\b/);
  });
});

/**
 * And a fourth claim, about the other end of the page's TOP: the ground ABOVE
 * the document's own y=0, which a rubber-band overscroll pulls into view
 * (`canvasTop`, resolved by $lib/canvas-top, painted by `.canvas-top` in
 * app.css). The foot of the page is a canvas colour — one value, the same on
 * every route, set on `html` — and this end cannot be, because the top of the
 * page is the homepage hero's flat dark garnet on one route and the mastheads'
 * garnet on another. So the route says which.
 *
 * THE CLASS IS EXACTLY `navOver: "dark"`, and that is the whole reason this
 * block exists rather than a per-route memory. A route whose first band runs
 * under the bar starts at y=0, so the pixel above it is the band's own ground; a
 * route with a solid bar gets the layout's 70/80px top padding, so the thing
 * above ITS y=0 is the page ground — which is what an unclaimed route already
 * shows, and why claiming nothing is the right answer for it rather than an
 * omission.
 *
 * Both directions, because both fail silently and only during a pull: a dark
 * route that claims nothing shows off-white above its garnet (the white flash
 * the operator reported, 2026-09-21), and a light route that claims something
 * paints a garnet band nobody asked for.
 */
describe("canvasTop — the ground above the top of the document", () => {
  /** The band a route opens on → the token it must claim, and the ground class
   *  the component itself wears, which is what makes the token the right one. */
  const BAND_GROUNDS = {
    // A FLAT ground, not the gradient the mastheads wear.
    HomeHero: {
      token: "dark",
      ground: "bg-dark",
      file: "src/lib/slices/HomeHero/index.svelte",
    },
    // A gradient, so the token is its FIRST stop — `to-dark` is the bottom.
    PageMasthead: {
      token: "primary",
      ground: "from-primary",
      file: "src/lib/components/PageMasthead.svelte",
    },
  } as const;

  const claimed = (page: string): string | undefined =>
    ["+page.server.ts", "+page.ts"]
      .map((name) => join(dirname(page), name))
      .filter((file) => existsSync(file))
      .map((file) => /canvasTop:\s*"(\w+)"/.exec(readFileSync(file, "utf8"))?.[1])
      .find(Boolean);

  const routes = pages(ROUTES).map((file) => ({
    route: relative(ROUTES, dirname(file)) || "/",
    first: firstTag(readFileSync(file, "utf8")),
    dark: claimsDark(file),
    canvasTop: claimed(file),
  }));

  it("finds the pages, and both dark bands are open on at least one route each", () => {
    expect(routes.length).toBeGreaterThan(3);
    for (const band of Object.keys(BAND_GROUNDS)) {
      expect(
        routes.filter((p) => p.first === band).length,
        `no route opens on <${band}>`,
      ).toBeGreaterThan(0);
    }
  });

  it("every route whose first band runs under the bar claims a ground for it", () => {
    const silent = routes.filter((p) => p.dark && !p.canvasTop);
    expect(silent.map((p) => p.route)).toEqual([]);
  });

  it("and no route that does not — an unclaimed route keeps the page ground", () => {
    const extra = routes.filter((p) => !p.dark && p.canvasTop);
    expect(extra.map((p) => `${p.route} claims "${p.canvasTop}" with a solid bar`)).toEqual([]);
  });

  it("every claim is a token $lib/canvas-top can resolve", () => {
    const unknown = routes
      .filter((p) => p.canvasTop && !(p.canvasTop in CANVAS_TOP_COLORS))
      .map((p) => `${p.route} claims "${p.canvasTop}"`);
    expect(unknown).toEqual([]);
  });

  // The part a rename would otherwise walk straight past: the token has to name
  // the ground of the band the route actually opens on. Both sides are read —
  // the route's claim from its page data, the band's ground from the component.
  it("every claim names the ground of the band that route opens on", () => {
    const wrong = routes
      .filter((p) => p.canvasTop)
      .filter((p) => p.canvasTop !== BAND_GROUNDS[p.first as keyof typeof BAND_GROUNDS]?.token)
      .map((p) => `${p.route} opens on <${p.first}> and claims "${p.canvasTop}"`);
    expect(wrong).toEqual([]);
  });

  it("and each band really does wear that ground on its own first element", () => {
    for (const [band, { token, ground, file }] of Object.entries(BAND_GROUNDS)) {
      const open = /<[A-Za-z][\s\S]*?>/.exec(
        markup(readFileSync(resolve(process.cwd(), file), "utf8")),
      )?.[0];
      expect(open, `${band}: no opening tag in ${file}`).toBeTruthy();
      expect(open, `${band}'s first element does not wear ${ground}`).toContain(ground);
      // …and the class really is the token, so neither can be renamed alone.
      expect(ground.endsWith(`-${token}`), `${ground} does not name "${token}"`).toBe(true);
    }
  });

  it("the layout renders the element once, outside the wrapper, with the route's claim", () => {
    const layout = readFileSync(join(ROUTES, "+layout.svelte"), "utf8");
    const tags = markup(layout).match(/<div class="canvas-top"[\s\S]*?><\/div>/g) ?? [];
    expect(tags, "one .canvas-top, rendered by the layout").toHaveLength(1);
    expect(tags[0]).toContain("canvasTopStyle(page.data.canvasTop)");
    expect(tags[0], "decorative, and never in the reading order").toContain('aria-hidden="true"');
    // It must not sit between <main> and <footer>: the pinned photo band's
    // rules in app.css are written on that adjacency (`main + footer`).
    const body = markup(layout);
    expect(body.indexOf('class="canvas-top"')).toBeLessThan(body.indexOf("<main"));
  });
});
