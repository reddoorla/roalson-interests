import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { CANVAS_TOP_COLORS, canvasTopStyleTag, canvasTopThemeColor } from "$lib/canvas-top";
import { homeHeroFixture } from "$lib/home-fixture";
import HomeHero from "$lib/slices/HomeHero/index.svelte";
import PageMasthead from "$lib/components/PageMasthead.svelte";

const state = vi.hoisted(() => ({
  page: { data: {} as Record<string, unknown>, url: new URL("http://localhost/") },
}));
vi.mock("$app/state", () => state);
vi.mock("$app/navigation", () => ({ afterNavigate: () => {}, beforeNavigate: () => {} }));

const { default: Layout } = await import("./+layout.svelte");

afterEach(cleanup);

/** The root layout as a route with this page data gets it, around `page`. */
function layout(data: Record<string, unknown>, page = "<div></div>") {
  state.page.data = data;
  return render(Layout, {
    props: {
      data: { isPreviewSession: false },
      children: createRawSnippet(() => ({ render: () => page })),
    },
  });
}

/**
 * The bar floats — transparent, white wordmark, sand controls — only over a
 * dark first band, and it learns that from the ROUTE (`navOver: "dark"` in its
 * page data), because the layout renders the bar before it has seen the page.
 * That is a claim made in one file about markup in another, so nothing but
 * this test holds the two together: a route that says so and opens on anything
 * else gets a white wordmark on an off-white page, which is no wordmark at all.
 *
 * "Opens on" is read from the page's markup: the first element or component
 * after the script block that renders anything. It is read as text because
 * rendering a route needs its CMS data; what it reads is which band a route
 * opens on and which claims it makes, never a class. Two bands may run under
 * the bar (DARK_FIRST_BANDS):
 *
 *  - HomeHero, whose route lifts the hero out of the document's slices and
 *    renders <HomeHero> first and unconditionally; with no slice the
 *    component still paints its dark ground (HomeHero.test.ts). The
 *    "unconditionally" test below holds that: {#if} is not a tag, so a band
 *    wrapped in one still reads as the first tag.
 *  - PageMasthead, and only with no photo. Over its garnet gradient
 *    (/contact) the floating bar's sand is legible as it stands. Over a
 *    photograph nothing darkens the top of the band, so a route that gives
 *    the masthead a photo (/properties) opens under the SOLID bar and makes
 *    no claim.
 */
const DARK_FIRST_BANDS = ["PageMasthead", "HomeHero"];
/** How a band's first tag gives it a photograph, for the bands that take one. */
const PHOTO_PROP: Record<string, RegExp> = { PageMasthead: /(?:^|\s)(?:image\s*=|\{image\})/ };

const ROUTES = resolve(process.cwd(), "src/routes");

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "+page.svelte" ? [full] : [];
  });
}

/** A page's markup: scripts, comments, <svelte:head> and snippet declarations
 *  removed — none of them render where they are written. */
function markup(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svelte:head>[\s\S]*?<\/svelte:head>/g, "")
    .replace(/\{#snippet[\s\S]*?\{\/snippet\}/g, "");
}

/** An opening tag that renders: `<svelte:window>` and its kin draw nothing. */
const OPEN_TAG = /<(?!svelte:(?:window|document|body|options)\b)([A-Za-z][\w.:-]*)/;

/** The first tag a page renders: scripts, comments and Svelte blocks skipped. */
function firstTag(source: string): string | undefined {
  return OPEN_TAG.exec(markup(source))?.[1];
}

/** That tag's attributes, as written — up to the `>` that closes it, stepping
 *  over any `{…}` expression, whose own `>` would otherwise end it early. */
function firstTagAttributes(source: string): string {
  const text = markup(source);
  const open = OPEN_TAG.exec(text);
  if (!open) return "";
  let depth = 0;
  for (let i = open.index + open[0].length; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    else if (text[i] === ">" && depth === 0)
      return text.slice(open.index + open[0].length, i).replace(/\/$/, "");
  }
  return "";
}

/** True when a Svelte block ({#if}, {#each}, {#await}…) opens before the first
 *  tag — i.e. the first band is conditional, whatever its name. */
function firstTagIsConditional(source: string): boolean {
  const text = markup(source);
  const tagAt = text.search(OPEN_TAG);
  return tagAt !== -1 && text.slice(0, tagAt).includes("{#");
}

function claimsDark(page: string): boolean {
  return ["+page.server.ts", "+page.ts"]
    .map((name) => join(dirname(page), name))
    .filter((file) => existsSync(file))
    .some((file) => /navOver:\s*"dark"/.test(readFileSync(file, "utf8")));
}

const all = pages(ROUTES).map((file) => {
  const source = readFileSync(file, "utf8");
  const first = firstTag(source);
  const photo = first && PHOTO_PROP[first];
  return {
    route: relative(ROUTES, dirname(file)) || "/",
    first,
    photo: Boolean(photo && photo.test(firstTagAttributes(source))),
    conditional: firstTagIsConditional(source),
    claims: claimsDark(file),
  };
});

describe("navOver — the route's claim about its first band", () => {
  it("finds the pages, and at least one that opens on a dark band", () => {
    expect(all.length).toBeGreaterThan(3);
    expect(all.filter((p) => p.first && DARK_FIRST_BANDS.includes(p.first)).length).toBeGreaterThan(
      0,
    );
  });

  it("every route that says so opens on a dark band", () => {
    const wrong = all.filter((p) => p.claims && !(p.first && DARK_FIRST_BANDS.includes(p.first)));
    expect(wrong.map((p) => `${p.route} opens on <${p.first}>`)).toEqual([]);
  });

  // The claim is a literal, made before the page has any data — so the band it
  // describes may not depend on data either. A first band inside {#if hero}
  // passes the test above and is a white wordmark on an off-white page the
  // day the condition is false.
  it("every route that says so renders that band unconditionally", () => {
    const conditional = all.filter((p) => p.claims && p.conditional);
    expect(conditional.map((p) => `${p.route} opens on <${p.first}> inside a block`)).toEqual([]);
  });

  // The client's call of 2026-09-29, as a rule: no floating bar over a masthead
  // PHOTOGRAPH. The prop is read off the first tag as written, so a photo
  // passed from page data (`image={data.masthead}`) counts whether or not the
  // CMS has one today — the claim is a literal and cannot wait to find out.
  it("no route floats the bar over a masthead photograph", () => {
    const over = all.filter((p) => p.claims && p.photo);
    expect(over.map((p) => `${p.route} claims navOver over <${p.first}> with a photo`)).toEqual([]);
  });

  // The rule above is only as good as the parse that finds the photo: shown
  // here to find one written either way, and none on a masthead without.
  it("reads a masthead's photo off its first tag, however it is passed", () => {
    const photo = (page: string) => PHOTO_PROP.PageMasthead.test(firstTagAttributes(page));
    expect(photo("<PageMasthead title={data.title} image={data.masthead} />")).toBe(true);
    expect(photo('<PageMasthead {image} title="Our Properties" />')).toBe(true);
    expect(photo('<PageMasthead title="Contact Us" />')).toBe(false);
  });

  it("the layout floats the bar for a route that says so, and only for one", () => {
    const bar = () => document.querySelector('nav[aria-label="Primary"]');
    layout({ navOver: "dark" });
    expect(bar()?.hasAttribute("data-floating"), "a claiming route's bar").toBe(true);
    cleanup();
    layout({});
    expect(bar(), "the bar").not.toBeNull();
    expect(bar()!.hasAttribute("data-floating"), "an unclaimed route's bar").toBe(false);
  });

  // What "no claim" buys a route: <main> is padded clear of the solid bar, so
  // its first band — a masthead's h1, a person's — does not open underneath
  // it; and a claiming route's band starts at y=0, under the floating bar.
  it("the layout clears the bar for every route that does not say so, and only for those", () => {
    const padded = () =>
      document
        .querySelector("main")!
        .className.split(/\s+/)
        .some((c) => /^(?:[a-z0-9]+:)*p[ty]?-/.test(c));
    layout({});
    expect(padded(), "an unclaimed route's <main> has no top padding").toBe(true);
    cleanup();
    layout({ navOver: "dark" });
    expect(padded(), "a claiming route's <main> is padded, so its band opens below the bar").toBe(
      false,
    );
  });
});

/**
 * And another: ON THE HOMEPAGE the bar has no wordmark until the hero's RI
 * cutout has scrolled away (`navWordmark: "gated"`, operator call 8, #18). Nav
 * measures a `[data-nav-gate]` element, and a route that claims the gate
 * without one simply gets its wordmark back after mount — so a claim made
 * everywhere would look right in every hydrated browser, and cost every page
 * its wordmark in the server's markup (and, script on and bundle missing, for
 * good). Only a route that opens on the band carrying the gate may claim it,
 * and the layout hands the bar the ROUTE's claim, not one of its own.
 */
describe("navWordmark — only a route with the gate gates the bar's wordmark", () => {
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

  it("no route claims the gate but one that opens on HomeHero", () => {
    expect(routes.filter((p) => p.gates && p.first !== "HomeHero").map((p) => p.route)).toEqual([]);
  });

  it("the element the bar waits for is in HomeHero's band", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    expect(container.querySelector("[data-nav-gate]")).not.toBeNull();
  });

  // jsdom has no layout, so the gate is placed below the bar by hand: a gate
  // still ahead is what holds the wordmark back.
  it("the layout hands the bar the route's claim, not one of its own", () => {
    const below = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const y = this.matches("[data-nav-gate]") ? 1000 : 0;
      return { top: y, bottom: y + 80 } as DOMRect;
    });
    const held = () => document.querySelector('[data-nav-wordmark="gated"]') !== null;
    try {
      layout({ navOver: "dark", navWordmark: "gated" }, "<div data-nav-gate></div>");
      expect(held(), "a route that claims the gate").toBe(true);
      cleanup();
      layout({ navOver: "dark" }, "<div data-nav-gate></div>");
      expect(held(), "a route that does not").toBe(false);
    } finally {
      below.mockRestore();
    }
  });
});

/**
 * And a third claim, about the other end of the page's TOP: the ground ABOVE
 * the document's own y=0, which a rubber-band overscroll pulls into view
 * (`canvasTop`, resolved by $lib/canvas-top). It IS the canvas — `html`'s
 * background — because the canvas is the only thing a browser paints past the
 * top of a document, and the route declares it through a rule the layout puts
 * in the head. The FOOT is the end that can be painted by an element instead
 * (`.canvas-foot`), since painting below the document's end is not clipped.
 * It was the other way round until 2026-09-22 and the top never appeared.
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
  /** The bands a route may open on under the bar, as a visitor gets them. */
  const BANDS = {
    HomeHero: () => render(HomeHero, { props: { slice: homeHeroFixture() } }).container,
    PageMasthead: () => render(PageMasthead, { props: { title: "Properties" } }).container,
  };

  /** The canvas token a class list paints along its TOP edge: a vertical
   *  gradient's top stop, else its flat ground. Undefined when that colour is no
   *  token $lib/canvas-top can resolve — or a gradient runs across the edge. */
  function topGround(list: string[]): string | undefined {
    const last = (prefix: string) =>
      list
        .filter((c) => c.startsWith(`${prefix}-`))
        .map((c) => c.slice(prefix.length + 1))
        .filter((token) => token in CANVAS_TOP_COLORS)
        .at(-1);
    const direction = list
      .map((c) => /^bg-(?:gradient|linear)-to-([a-z]+)$/.exec(c)?.[1])
      .filter(Boolean)
      .at(-1);
    if (direction === undefined) return last("bg");
    return direction === "b" ? last("from") : direction === "t" ? last("to") : undefined;
  }

  /** Each band's root element, rendered, and the ground it paints at its top. */
  const grounds = () =>
    Object.entries(BANDS).map(([band, mount]) => {
      const root = mount().firstElementChild;
      const worn = root?.className ?? "";
      cleanup();
      return { band, worn, top: topGround(worn.split(/\s+/).filter(Boolean)) };
    });

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
  // the route's claim from its page data, the band's ground from what the
  // component RENDERS. A band whose top colour moves without its routes' claim
  // moving with it shows a seam of the old colour above it on every pull.
  it("every claim names the ground of the band that route opens on", () => {
    const top = Object.fromEntries(grounds().map((g) => [g.band, g.top]));
    const wrong = routes
      .filter((p) => p.canvasTop)
      .filter((p) => p.canvasTop !== top[p.first ?? ""])
      .map((p) => `${p.route} opens on <${p.first}> and claims "${p.canvasTop}"`);
    expect(wrong).toEqual([]);
  });

  it("and each band paints a ground $lib/canvas-top can resolve along its top edge", () => {
    for (const { band, worn, top } of grounds())
      expect(top, `${band}'s root element wears "${worn}"`).toBeDefined();
  });

  // The two tests above are only as good as the read: shown here to find the
  // top stop whichever way a gradient runs, and nothing it cannot claim.
  it("reads a band's top ground off its classes", () => {
    expect(topGround(["relative", "isolate", "bg-dark"])).toBe("dark");
    expect(topGround(["bg-gradient-to-b", "from-primary", "to-dark"])).toBe("primary");
    expect(topGround(["bg-linear-to-t", "from-primary", "to-dark"])).toBe("dark");
    expect(topGround(["bg-gradient-to-r", "from-primary", "to-dark"])).toBeUndefined();
    expect(topGround(["bg-white"])).toBeUndefined();
  });

  it("the layout puts the claim in the HEAD and the foot after the whole page", () => {
    for (const canvasTop of ["primary", undefined]) {
      layout(canvasTop ? { navOver: "dark", canvasTop } : {});
      // The TOP is the canvas (`html` in app.css), so the route's claim has to
      // reach `:root` — which a component cannot do with an attribute on its
      // own markup. And theme-color ships on EVERY route, claim or no claim.
      const metas = document.head.querySelectorAll('meta[name="theme-color"]');
      expect(metas, `theme-color with canvasTop ${canvasTop}`).toHaveLength(1);
      expect(metas[0].getAttribute("content")).toBe(canvasTopThemeColor(canvasTop));
      if (canvasTop) expect(document.head.innerHTML).toContain(canvasTopStyleTag(canvasTop));

      const feet = document.querySelectorAll(".canvas-foot");
      expect(feet, "one .canvas-foot, rendered by the layout").toHaveLength(1);
      expect(feet[0].getAttribute("aria-hidden"), "decorative").toBe("true");

      // It must not sit between <main> and <footer>: the pinned photo band's
      // rules in app.css are written on that adjacency (`main + footer`).
      const footer = document.querySelector("footer")!;
      expect(document.querySelector("main")!.nextElementSibling).toBe(footer);
      expect(footer.compareDocumentPosition(feet[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      cleanup();
    }
  });
});
