import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { hydrated } from "./hydrated";

// The bar makes promises jsdom cannot check (see Nav.svelte) — three here, and
// a fourth about the homepage alone, at the foot of this file:
//
//  1. it FLOATS — no ground, white wordmark, dust controls — only over a dark
//     first band, and takes the page's off-white ground once the page moves;
//  2. it never needs script to stay legible: a floating bar is `absolute` in
//     the server's markup and is pinned only once script has mounted, and the
//     menu's links reach a browser that will never open the menu;
//  3. it never needs script to NAVIGATE either, in the state no <noscript> can
//     see — scripting on, bundle never arrived (#19). There the trigger is a
//     link to the footer's list of pages, and a click has to get there.
//
// Both fixtures render through the real layout. DARK opens on PageMasthead and
// claims `navOver`; LIGHT opens on the property page and claims nothing.
const DARK = "/dev/properties";
const LIGHT = "/dev/property";

const OFF_WHITE = "rgb(242, 239, 233)";
const GARNET = "rgb(101, 35, 35)";
const DUST = "rgb(178, 172, 159)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

const bar = 'nav[aria-label="Primary"]';

/** The menu trigger in WHICHEVER form it has — the server's link or the
 *  mounted button — found by the glyph both carry (the overlay's Close has the
 *  same box, but is not in the bar). The tests that ask "what does activating
 *  the trigger do" use this, so that a trigger of the wrong kind fails on the
 *  outcome and not on a selector that stopped matching. */
const menuTrigger = `${bar} :is(a, button):has(svg[viewBox="0 0 20 16"])`;

/** On a page that opens on a dark band the server ships the bar `absolute`
 *  and only mount pins it — so `fixed` is positive evidence that script has
 *  adopted the bar, and that the trigger's handler exists. A click before it
 *  lands on server markup and opens nothing. */
const adopted = hydrated;

/** Where the bar's content ends, read from the bar — NOT from the window or
 *  from documentElement.clientWidth. On the Linux CI runner both say 1440 while
 *  the bar lays out 15px narrower (app.css's `scrollbar-gutter: stable` keeps a
 *  gutter that neither number reports), so "1440 - 80" was wrong there twice.
 *  Returns the right-hand gutter too, which IS the comp's number. */
const contentEdge = (page: Page) =>
  page.evaluate((selector) => {
    const row = document.querySelector(`${selector} > div`)!;
    const gutter = parseFloat(getComputedStyle(row).paddingRight);
    return {
      gutter,
      right: row.getBoundingClientRect().right - gutter,
      inner: innerWidth,
      client: document.documentElement.clientWidth,
      row: row.getBoundingClientRect().width,
    };
  }, bar);

test("the server ships a floating bar unpinned, with the menu's links beside it", async ({
  page,
}) => {
  const html = await (await page.request.get(DARK)).text();
  const nav = /<nav[^>]*aria-label="Primary"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
  const open = /<nav[^>]*>/.exec(nav)?.[0] ?? "";

  expect(open, "floating in the markup").toContain("data-floating");
  expect(open, "not pinned until script adopts it").toMatch(/class="[^"]*\babsolute\b/);
  expect(open).not.toMatch(/class="[^"]*\bfixed\b/);

  const noscript = /<noscript[^>]*>([\s\S]*?)<\/noscript>/.exec(nav)?.[1] ?? "";
  expect(noscript, "the listing is reachable without the menu").toContain('href="/properties"');
  expect(noscript).toContain('href="/contact"');

  // The trigger on the wire is a LINK to the footer's nav (#19) — a <button>
  // here is a control that does nothing until a bundle arrives, and nothing
  // ever if it does not. It is marked for the noscript rule, because with
  // scripting off the list above has already done its job.
  const outside = nav.replace(/<noscript[\s\S]*?<\/noscript>/g, "");
  expect(outside, "no button in the server's bar").not.toContain("<button");
  const fallback = /<a\b[^>]*data-menu-fallback[^>]*>/.exec(outside)?.[0] ?? "";
  expect(fallback, "the trigger is a link").toContain('href="#footer-nav"');
  expect(fallback, "marked for the noscript rule").toContain("data-js-only");
  expect(html, "and what it points at is on the same page").toMatch(/<nav[^>]*id="footer-nav"/);
});

test("with scripting off, the floating bar stays on its dark band and the links are in it", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(DARK, { waitUntil: "domcontentloaded" });

    await expect(page.locator(bar)).toHaveCSS("position", "absolute");
    await expect(page.locator(bar)).toHaveCSS("background-color", TRANSPARENT);
    // Present, then hidden — `toBeHidden()` alone also passes for a locator
    // that matches nothing, which is what a renamed trigger would be.
    await expect(page.locator(menuTrigger)).toHaveCount(1);
    await expect(page.locator(menuTrigger), "the list below already is the menu").toBeHidden();

    const links = page.locator(`${bar} noscript a`);
    await expect(links).toHaveText(["Our Properties", "Contact Us"]);
    await expect(links.first()).toBeVisible();
    await expect(links.first()).toHaveCSS("color", DUST);
    // At this width the CTA is in the bar and already is the second link…
    await expect(links.nth(1)).toBeHidden();
    await expect(page.locator(`${bar} a`, { hasText: "Contact us" }).last()).toBeVisible();

    // …and at 390 it is not, so the list carries it — and still fits the bar.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(links.nth(1)).toBeVisible();
    const lastLink = await links.nth(1).boundingBox();
    const narrow = await contentEdge(page);
    expect(narrow.gutter, "the comp's 20px gutter").toBe(20);
    expect(lastLink!.x + lastLink!.width, JSON.stringify(narrow)).toBeLessThanOrEqual(
      narrow.right + 0.5,
    );
    expect(lastLink!.y, "on the bar's one line").toBeLessThan(70);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Never over light content: it left with the band it was toned for.
    const masthead = await page.locator("main header").first().boundingBox();
    const barBox = await page.locator(bar).boundingBox();
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(masthead!.y + masthead!.height);
  } finally {
    await context.close();
  }
});

test("with scripting off, a solid bar is pinned and legible from the server's markup", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(LIGHT, { waitUntil: "domcontentloaded" });
    await hydrated(page);
    await expect(page.locator(bar)).toHaveCSS("background-color", OFF_WHITE);
    await expect(page.locator(`${bar} noscript a`).first()).toHaveCSS("color", GARNET);
  } finally {
    await context.close();
  }
});

// #19. Scripting is ON and every script request is refused, so nothing
// hydrates and <noscript> does not apply — the state a blocked chunk, a CSP
// mistake or a dropped connection leaves a visitor in. The trigger must still
// take them to the site's pages.
//
// What counts as a pass is where the visitor ENDS UP: the footer's nav in the
// viewport, a link to /properties in it, visible, and the next thing Tab
// reaches. Everything before the click only establishes that the page is in
// the state the test is named for — a test of this shape that quietly
// hydrated would click a working menu button and prove nothing:
//
//  - `refused > 0`: the block matched real requests (a route pattern that
//    matches nothing blocks nothing, and passes);
//  - the trigger is VISIBLE: scripting is on, or `[data-js-only]` would have
//    hidden it (that is the scripting-off test above);
//  - at the very end the trigger is still an <a> and no dialog exists: mount
//    swaps the link for a <button>, so that is what an un-mounted bar looks
//    like. It is checked LAST on purpose — checked before the click it was the
//    first thing a dead <button> failed (measured, by putting one back), and
//    the test went red on the element's tag without ever asking whether the
//    click got anyone anywhere.
//
// DARK at 390 is the case the issue was filed for — CONTACT US is hidden below
// `sm`, so the wordmark was the only working link in the bar. LIGHT at 1440 is
// the other bar: solid and pinned in the server's markup, so the jump has to
// land clear of it.
for (const [name, url, viewport] of [
  ["a floating bar at 390", DARK, { width: 390, height: 844 }],
  ["a solid, pinned bar at 1440", LIGHT, { width: 1440, height: 900 }],
] as const) {
  test(`script on, bundle never arrives — the trigger reaches the footer's nav (${name})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      let refused = 0;
      await page.route("**/*", (route) => {
        if (route.request().resourceType() !== "script") return route.continue();
        refused += 1;
        return route.abort();
      });
      await page.goto(url, { waitUntil: "load" });

      expect(refused, "the block refused real script requests").toBeGreaterThan(0);
      const control = page.locator(menuTrigger);
      await expect(control).toHaveCount(1);
      await expect(control, "scripting is on: the noscript rule did not hide it").toBeVisible();

      const footerNav = page.locator("#footer-nav");
      const listing = footerNav.locator('a[href="/properties"]');
      await expect(
        footerNav,
        "the page is long enough for this to mean something",
      ).not.toBeInViewport();

      await control.click();

      await expect(footerNav).toBeInViewport();
      await expect(listing).toBeVisible();
      await expect(listing).toBeInViewport({ ratio: 1 });
      expect(new URL(page.url()).hash).toBe("#footer-nav");

      // Clear of the bar, measured against the bar — a pinned one would
      // otherwise sit on top of the list it just jumped to.
      const gap = await page.evaluate((selector) => {
        const barBox = document.querySelector(selector)!.getBoundingClientRect();
        const link = document.querySelector('#footer-nav a[href="/properties"]')!;
        return link.getBoundingClientRect().top - barBox.bottom;
      }, bar);
      expect(gap, "the link is below the bar, not under it").toBeGreaterThanOrEqual(0);

      // Reachable, not just painted: a fragment jump moves the keyboard's
      // starting point, so the next Tab is the first link of that list.
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return { href: el?.getAttribute("href"), inFooterNav: Boolean(el?.closest("#footer-nav")) };
      });
      expect(focused).toEqual({ href: "/properties", inFooterNav: true });

      expect(await control.evaluate((el) => el.tagName), "and it never hydrated").toBe("A");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

// The cost of rendering two elements for one control: mount REMOVES the link a
// keyboard user may already be standing on. Scripts are held at the network,
// not refused, so the test can put focus on the server's link and then let
// hydration happen to it.
test("a keyboard user already on the trigger keeps their place when script arrives", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await held;
    await route.continue();
  });
  // "commit": DOMContentLoaded waits for module scripts, which are being held.
  await page.goto(LIGHT, { waitUntil: "commit" });

  const fallback = page.locator(`${bar} a[data-menu-fallback]`);
  await expect(fallback).toBeVisible();
  await fallback.focus();
  await expect(fallback).toBeFocused();

  release();
  await expect(page.getByLabel("Open menu")).toBeFocused();
  await expect(fallback, "the link it replaced is gone").toHaveCount(0);

  // …and it is the working button: Enter opens the menu from where they stood.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
});

test("the bar floats over the masthead, and takes its ground when the page moves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DARK);
  const trigger = page.getByLabel("Open menu");
  const cta = page.locator(`${bar} a`, { hasText: "Contact us" });

  // Adopted by script: pinned, and at scroll 0 that paints where `absolute` did.
  await hydrated(page);
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
  await expect(page.locator(bar)).toHaveCSS("background-color", TRANSPARENT);
  await expect(trigger).toHaveCSS("color", DUST);
  await expect(cta).toHaveCSS("color", DUST);

  // The scripting-off list is in the tree here too — as raw text inside a
  // <noscript> that Chromium gives no box. `display: contents` on that element
  // hands the text to the bar to lay out: `class="contents"` was the first
  // draft, and it printed the list's markup across the bar at 390.
  await expect(page.locator(`${bar} noscript`)).toBeHidden();
  expect(await page.locator(bar).innerText()).not.toContain("<li>");

  // The masthead runs UNDER the bar, as the comp draws it.
  expect((await page.locator("main header").first().boundingBox())!.y).toBe(0);
  await expect(page.locator(bar)).toHaveCSS("height", "80px");

  await page.mouse.wheel(0, 600);
  await expect(page.locator(bar)).not.toHaveAttribute("data-floating", "");
  await expect(page.locator(bar)).toHaveCSS("background-color", OFF_WHITE);
  await expect(trigger).toHaveCSS("color", GARNET);
  await expect(cta).toHaveCSS("color", GARNET);

  await page.mouse.wheel(0, -600);
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
});

test("a page that opens on a light band clears the bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LIGHT);
  await expect(page.locator(bar)).toHaveCSS("background-color", OFF_WHITE);
  const barBox = await page.locator(bar).boundingBox();
  const first = await page.locator("main#main-content > *").first().boundingBox();
  expect(first!.y, "nothing starts under the bar").toBeGreaterThanOrEqual(barBox!.height);

  // Auto-retrying on purpose: on the CI runner the bar still measured 80 the
  // instant setViewportSize resolved — the resize had not been laid out yet.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(bar)).toHaveCSS("height", "70px");
  await expect
    .poll(async () => (await page.locator("main#main-content > *").first().boundingBox())!.y)
    .toBeGreaterThanOrEqual(70);
});

test("the open menu: named, focused, locked, clean under axe, and closed by Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DARK);
  await adopted(page);
  const edge = await contentEdge(page);
  const glyphBox = await page.getByLabel("Open menu").locator("svg").boundingBox();
  const triggerBox = await page.getByLabel("Open menu").boundingBox();
  await page.getByLabel("Open menu").click();

  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(page.getByLabel("Close menu")).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await expect(menu.locator("ul a")).toHaveText(["Home", "Our Properties", "Contact Us"]);
  // The fixture is not a real destination, so nothing is current here…
  await expect(menu.locator('[aria-current="page"]')).toHaveCount(0);

  // The Close sits exactly where the trigger was — and the trigger's GLYPH,
  // not its 44px target, ends on the comp's 80px gutter, centred on y=40.
  expect(await page.getByLabel("Close menu").boundingBox()).toEqual(triggerBox);
  const measured = JSON.stringify({ edge, glyphBox, triggerBox });
  expect(edge.gutter, measured).toBe(80);
  expect(glyphBox!.x + glyphBox!.width, measured).toBeCloseTo(edge.right, 1);
  expect(triggerBox!.width, measured).toBe(44);
  expect(triggerBox!.y + triggerBox!.height / 2, measured).toBe(40);

  const results = await new AxeBuilder({ page })
    .include("#nav-menu")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const crashed = results.incomplete.flatMap((rule) =>
    rule.nodes.flatMap((node) =>
      [...node.any, ...node.all, ...node.none].filter((check) => check.id === "error-occurred"),
    ),
  );
  expect(crashed, "axe rules crashed, so they measured nothing").toEqual([]);
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByLabel("Open menu")).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("the menu marks the page you are on", async ({ page }) => {
  await page.goto("/properties");
  await adopted(page);
  await page.getByLabel("Open menu").click();
  const current = page.getByRole("dialog", { name: "Menu" }).locator('[aria-current="page"]');
  await expect(current).toHaveText(["Our Properties"]);
});

// ---------------------------------------------------------------------------
// #18 — ON THE HOMEPAGE ONLY the bar has no wordmark until the hero's RI cutout
// has scrolled away (operator call 8). HOME is the home route's own markup over
// fixture data, through the real layout; it claims `navWordmark: "gated"` and
// its hero's band carries `[data-nav-gate]`.
//
// "Scrolled away" is the band's top reaching the bar's bottom, and that is how
// every step below is stated: the distance to the gate is READ from the two
// rects at rest, never written down as 448, and every state is asserted
// together with the geometry it is supposed to follow from. The hero pins, so
// the page's scrollY is not what is under the bar — and this runner lays the
// page out 15px narrower than its window, so nothing here comes from the window.
const HOME = "/dev/home";

/** The bar, the gate, and what the bar is doing about it — one read. */
const gateState = (page: Page) =>
  page.evaluate((barSelector) => {
    const barEl = document.querySelector(barSelector)!;
    const gateEl = document.querySelector("[data-nav-gate]");
    const [garnet, reverse] = [...barEl.querySelectorAll('a[href="/"] img')].map((img) =>
      Number(getComputedStyle(img).opacity),
    );
    const barBottom = barEl.getBoundingClientRect().bottom;
    const gateTop = gateEl ? gateEl.getBoundingClientRect().top : null;
    return {
      scrollY: window.scrollY,
      barBottom,
      gateTop,
      reached: gateTop !== null && gateTop <= barBottom,
      floating: barEl.hasAttribute("data-floating"),
      ground: getComputedStyle(barEl).backgroundColor,
      garnet,
      reverse,
    };
  }, bar);

/** Scroll, then wait until the page has actually arrived. */
async function scrollPageTo(page: Page, y: number) {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
}

const HELD = { reached: false, floating: true, ground: TRANSPARENT, garnet: 0, reverse: 0 };
const PASSED = { reached: true, floating: false, ground: OFF_WHITE, garnet: 1, reverse: 0 };
const pick = ({ reached, floating, ground, garnet, reverse }: typeof HELD) => ({
  reached,
  floating,
  ground,
  garnet,
  reverse,
});

for (const [name, viewport] of [
  ["1440", { width: 1440, height: 600 }],
  ["390", { width: 390, height: 500 }],
] as const) {
  test(`on the homepage the wordmark waits for the band to reach the bar, and leaves with it (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(HOME);
    await adopted(page);

    // At rest: no wordmark — BOTH lockups at opacity 0 — on a bar that floats.
    await expect.poll(async () => pick(await gateState(page))).toEqual(HELD);
    const rest = await gateState(page);
    expect(rest.gateTop, "the fixture has a gate").not.toBeNull();
    const travel = rest.gateTop! - rest.barBottom;
    expect(travel, "the band starts below the bar").toBeGreaterThan(24);
    const reach = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(reach, "the page can scroll as far as the gate").toBeGreaterThanOrEqual(travel);

    // Far past the 24px that re-tones every other page, and 2px short of the
    // gate: still nothing, still floating.
    await scrollPageTo(page, Math.floor(travel) - 2);
    await expect.poll(async () => pick(await gateState(page))).toEqual(HELD);

    // The band's top on the bar's bottom: the ground and the garnet wordmark,
    // together.
    await scrollPageTo(page, Math.ceil(travel));
    await expect.poll(async () => pick(await gateState(page))).toEqual(PASSED);
    await expect(page.getByLabel("Open menu")).toHaveCSS("color", GARNET);

    // And on the way back up it goes again.
    await scrollPageTo(page, Math.floor(travel) - 2);
    await expect.poll(async () => pick(await gateState(page))).toEqual(HELD);
    await expect(page.getByLabel("Open menu")).toHaveCSS("color", DUST);
  });
}

test("the homepage's invisible wordmark is still a home link: tabbable, named, ringed — and shown on focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(HOME);
  await adopted(page);
  await expect.poll(async () => pick(await gateState(page))).toEqual(HELD);

  const home = page.locator(`${bar} a[href="/"]`);
  await expect(home).toHaveRole("link");
  await expect(home).toHaveAccessibleName("Home");

  // Reached with REAL Tabs, not a scripted focus(): the skip link first, then
  // the first thing in the bar. `visibility: hidden`, `display: none` and
  // `inert` would each send this Tab straight past it.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(home).toBeFocused();

  // The ring, in the floating bar's off-white, read in the same task as
  // :focus-visible and polled past the outline-color transition — see
  // focus-ring.spec.ts for why both halves are there.
  await expect
    .poll(() =>
      home.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          showing: el.matches(":focus-visible"),
          color: cs.outlineColor,
          width: cs.outlineWidth,
          style: cs.outlineStyle,
        };
      }),
    )
    .toEqual({ showing: true, color: OFF_WHITE, width: "2px", style: "solid" });

  // A ring around nothing tells a sighted keyboard user nothing, so focus
  // shows the (reverse) wordmark — and only focus: the gate is still holding.
  await expect
    .poll(async () => {
      const at = await gateState(page);
      return { reached: at.reached, floating: at.floating, garnet: at.garnet, reverse: at.reverse };
    })
    .toEqual({ reached: false, floating: true, garnet: 0, reverse: 1 });

  await page.keyboard.press("Tab");
  await expect(home).not.toBeFocused();
  await expect.poll(async () => pick(await gateState(page))).toEqual(HELD);
});

test("only the homepage: the server hides the wordmark there and nowhere else, and every other bar is as built", async ({
  page,
}) => {
  const wordmarks = async (url: string) => {
    const html = await (await page.request.get(url)).text();
    const nav = /<nav[^>]*aria-label="Primary"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    const home = /<a href="\/"[^>]*>([\s\S]*?)<\/a>/.exec(nav)?.[1] ?? "";
    return [...home.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({
      src: /src="([^"]*)"/.exec(tag)?.[1],
      hidden: /class="[^"]*\bopacity-0\b/.test(tag),
      marked: /data-nav-wordmark="gated"/.test(tag),
    }));
  };

  // The homepage: both lockups hidden on the wire (so no visitor sees a
  // wordmark flash before hydration), the reverse one marked for the noscript
  // rule and the garnet one not.
  expect(await wordmarks(HOME)).toEqual([
    { src: "/logo.svg", hidden: true, marked: false },
    { src: "/logo-reverse.svg", hidden: true, marked: true },
  ]);
  // Another page that opens on a dark band, and one that does not. A claim
  // made for every route would show here first: Nav gives a gated page with no
  // gate element its wordmark back on mount, so a HYDRATED /dev/properties
  // looks right either way — the server's markup is what would be wrong.
  expect(await wordmarks(DARK)).toEqual([
    { src: "/logo.svg", hidden: true, marked: false },
    { src: "/logo-reverse.svg", hidden: false, marked: false },
  ]);
  expect(await wordmarks(LIGHT)).toEqual([
    { src: "/logo.svg", hidden: false, marked: false },
    { src: "/logo-reverse.svg", hidden: true, marked: false },
  ]);

  // Hydrated, DARK floats with its reverse wordmark showing and re-tones when
  // the page moves — no gate, no waiting.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DARK);
  await adopted(page);
  await expect
    .poll(async () => {
      const at = await gateState(page);
      return { gateTop: at.gateTop, floating: at.floating, garnet: at.garnet, reverse: at.reverse };
    })
    .toEqual({ gateTop: null, floating: true, garnet: 0, reverse: 1 });
  await scrollPageTo(page, 200);
  await expect
    .poll(async () => {
      const at = await gateState(page);
      return { floating: at.floating, ground: at.ground, garnet: at.garnet, reverse: at.reverse };
    })
    .toEqual({ floating: false, ground: OFF_WHITE, garnet: 1, reverse: 0 });
});

test("with scripting off the homepage's wordmark is shown — by the noscript rule, over markup that hides it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    await expect(page.locator(bar)).toHaveCSS("position", "absolute");

    const [garnet, reverse] = [
      page.locator(`${bar} a[href="/"] img`).nth(0),
      page.locator(`${bar} a[href="/"] img`).nth(1),
    ];
    // The markup says hidden; the computed style says shown. Only app.html's
    // `[data-nav-wordmark="gated"]` rule stands between the two.
    await expect(reverse).toHaveClass(/\bopacity-0\b/);
    await expect(reverse).toHaveAttribute("data-nav-wordmark", "gated");
    await expect(reverse).toHaveCSS("opacity", "1");
    await expect(reverse).toBeVisible();
    // The white lockup and ONLY it: the bar is floating over the dark hero.
    await expect(garnet).toHaveCSS("opacity", "0");
    await expect(page.locator(bar)).toHaveCSS("background-color", TRANSPARENT);
  } finally {
    await context.close();
  }
});

test("a reload past the gate arrives solid, with its wordmark — the first look waits for the bar to be pinned", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(HOME);
  await adopted(page);
  const rest = await gateState(page);
  const past = Math.ceil(rest.gateTop! - rest.barBottom) + 60;
  await scrollPageTo(page, past);
  await expect.poll(async () => pick(await gateState(page))).toEqual(PASSED);

  await page.reload();
  await adopted(page);
  // The precondition, checked rather than assumed: the browser put the page
  // back where it was. Until mount the floating bar is `absolute` — its bottom
  // edge is then far ABOVE the viewport, and a gate read against it says
  // "ahead" on a page that is well past it.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(past);
  await expect.poll(async () => pick(await gateState(page))).toEqual(PASSED);
});

test("a gate claim with no band on the page is no gate: the wordmark shows, and the bar re-tones at once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(`${HOME}?bare`);
  await adopted(page);
  await expect
    .poll(async () => {
      const at = await gateState(page);
      return { gateTop: at.gateTop, floating: at.floating, garnet: at.garnet, reverse: at.reverse };
    })
    .toEqual({ gateTop: null, floating: true, garnet: 0, reverse: 1 });

  const reach = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(reach, "the bare fixture still scrolls").toBeGreaterThanOrEqual(100);
  await scrollPageTo(page, 100);
  await expect
    .poll(async () => {
      const at = await gateState(page);
      return { floating: at.floating, ground: at.ground, garnet: at.garnet };
    })
    .toEqual({ floating: false, ground: OFF_WHITE, garnet: 1 });
});
