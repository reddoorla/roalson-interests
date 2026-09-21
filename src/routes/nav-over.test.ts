import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

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
