import { expect, test, type Page } from "@playwright/test";

// The top of the homepage makes three promises jsdom cannot check (see
// src/lib/slices/HomeHero/index.svelte):
//
//  1. the hero PINS — 528px, `position: sticky` — while the garnet band slides
//     up over it;
//  2. the RI cutout rides ON THE BAND: its bottom edge is the band's top edge at
//     rest AND while the band moves, at 1440 and at 390;
//  3. the route opens on that dark band under a floating bar — even for a `home`
//     document with no hero slice in it.
//
// /dev/home is the home route's own markup over fixture data, through the real
// layout. `/` answers 404 until the Prismic repo is wired, and /dev/* 404s on
// every production build — so NONE of this is verified on a production build
// yet; that is an open issue, not an oversight here.
//
// Written to the lessons nav.spec.ts paid for: no x derived from the window
// (the runner lays out 15px narrower than its own innerWidth — every edge below
// is read from an element's own container); everything after a resize or a
// scroll auto-retries; hydration is waited for with positive evidence. The
// shared config forces `reducedMotion: "reduce"`, which is harmless here: a
// sticky box is not motion, and under `reduce` app.css makes scrollTo instant.
const HOME = "/dev/home";

const DARK = "rgb(61, 7, 7)";
const OFF_WHITE = "rgb(242, 239, 233)";

const bar = 'nav[aria-label="Primary"]';
const section = '[data-slice-type="home_hero"]';
const pin = `${section} [data-home-hero-pin]`;
const band = `${section} [data-nav-gate]`;
const cutout = `${section} [data-home-hero-cutout]`;

/** The bar is `absolute` in the server's markup over a dark first band, and
 *  only mount pins it — so `fixed` is positive evidence that script has run. */
const adopted = (page: Page) => expect(page.locator(bar)).toHaveCSS("position", "fixed");

/** Viewport rects of the three layers, plus how far the page has moved. */
const layers = (page: Page) =>
  page.evaluate(
    ([pinSel, bandSel, cutoutSel]) => {
      const rect = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
      };
      return {
        scrollY: window.scrollY,
        pin: rect(pinSel),
        band: rect(bandSel),
        cutout: rect(cutoutSel),
      };
    },
    [pin, band, cutout],
  );

/** Scroll, then wait until the page has actually arrived — a read taken the
 *  instant scrollTo returns can still be the old frame. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
}

test("the hero stays pinned while the band slides up over it", async ({ page }) => {
  // Short on purpose: the fixture page is one band tall, and the pin needs
  // room to be scrolled through.
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.goto(HOME);
  await adopted(page);
  await expect(page.locator(pin)).toHaveCount(1);
  await expect(page.locator(band)).toHaveCount(1);

  const rest = await layers(page);
  expect(rest.scrollY).toBe(0);
  expect(rest.pin.top, "the hero starts at the very top, under the bar").toBe(0);
  expect(rest.pin.height).toBe(528);
  expect(rest.band.top, "the band starts where the hero ends").toBe(rest.pin.bottom);

  await scrollTo(page, 200);
  const moved = await layers(page);
  // Positive evidence, all three: the page moved, the band moved with it, and
  // the hero did NOT.
  expect(moved.scrollY).toBe(200);
  expect(rest.band.top - moved.band.top, "the band scrolls normally").toBe(200);
  expect(moved.pin.top, "the hero is pinned").toBe(0);
  expect(moved.band.top, "so the band now overlaps it").toBeLessThan(moved.pin.bottom);

  // …and it is the BAND that paints in the overlap, not the hero under it. The
  // probe point is inside both boxes, read from the band's own rect.
  const onTop = await page.evaluate(
    ([bandSel, x, y]) => {
      const hit = document.elementFromPoint(x as number, y as number);
      return Boolean(hit && hit.closest(bandSel as string));
    },
    [band, moved.band.left + moved.band.width / 2, moved.band.top + 10] as const,
  );
  expect(onTop, "the band slides OVER the hero").toBe(true);

  // The pin lasts exactly as long as the band is tall — sticky is bounded by
  // the section the two share — and then the hero leaves with it. The page has
  // to be able to scroll that far for this to say anything, so that is checked
  // rather than assumed: the fixture grows a band per batch, the footer changes.
  const release = Math.round(rest.band.height) + 40;
  const reach = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(reach, "the page scrolls past the end of the pin").toBeGreaterThanOrEqual(release);
  await scrollTo(page, release);
  const past = await layers(page);
  expect(past.pin.top, "released once the band has passed").toBeLessThan(0);
  expect(past.band.top, "and still under the band's top edge").toBeLessThanOrEqual(past.pin.bottom);
});

for (const [name, width, height] of [
  ["1440", 1440, 600],
  ["390", 390, 500],
] as const) {
  test(`the cutout rides on the band's top edge at ${name}, at rest and as it moves`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(HOME);
    await adopted(page);
    await expect(page.locator(cutout)).toHaveCount(1);

    // Auto-retrying: right after setViewportSize the old layout is still
    // measurable. Half the BAND, capped at the comp's 451 — read from the band,
    // never from the window.
    await expect
      .poll(async () => {
        const at = await layers(page);
        return at.cutout.width - Math.min(at.band.width / 2, 451);
      })
      .toBeCloseTo(0, 1);

    const rest = await layers(page);
    expect(rest.cutout.height, "a square").toBeCloseTo(rest.cutout.width, 1);
    expect(rest.cutout.left, "flush with the band's left edge").toBeCloseTo(rest.band.left, 1);
    expect(rest.cutout.bottom, "seated on the band at rest").toBeCloseTo(rest.band.top, 1);
    expect(rest.cutout.top, "over the hero, not over the band").toBeGreaterThanOrEqual(
      rest.pin.top,
    );

    // At rest a cutout INSIDE the pinned hero sits in exactly the same place.
    // Only movement tells the two apart: it must leave with the band.
    await scrollTo(page, 150);
    const moved = await layers(page);
    expect(moved.pin.top, "the hero is still pinned").toBe(0);
    expect(rest.band.top - moved.band.top).toBe(150);
    expect(moved.cutout.bottom, "still seated on the band").toBeCloseTo(moved.band.top, 1);
  });
}

test("the list sits left of the headline at 1440 and under it at 390", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(HOME);
  await adopted(page);
  const h1 = page.locator(`${band} h1`);
  const list = page.locator(`${band} ul`);
  const buttons = page.locator(`${band} a`);
  await expect(buttons).toHaveText(["Contact us", "Our portfolio"]);

  await expect
    .poll(async () => {
      const [a, b] = [await list.boundingBox(), await h1.boundingBox()];
      return a!.x + a!.width <= b!.x;
    }, "list in the left column")
    .toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const [a, b] = [await list.boundingBox(), await buttons.last().boundingBox()];
      return a!.y >= b!.y + b!.height;
    }, "text first, list second")
    .toBe(true);
  const [listBox, h1Box] = [await list.boundingBox(), await h1.boundingBox()];
  expect(listBox!.x, "one column").toBeCloseTo(h1Box!.x, 1);
});

test("the bar floats over the hero, and the CMS buttons reach the filesystem routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(HOME);
  await adopted(page);

  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
  await expect(page.locator("main#main-content")).toHaveCSS("padding-top", "0px");
  const [barBox, pinBox] = [
    await page.locator(bar).boundingBox(),
    await page.locator(pin).boundingBox(),
  ];
  expect(pinBox!.y, "the hero runs UNDER the bar").toBe(barBox!.y);
  await expect(page.locator(pin)).toHaveCSS("background-color", DARK);

  // The fixture stores /contact the way the editor does — `https:///contact` —
  // so this is $lib/cms-href end to end, in a browser.
  const buttons = page.locator(`${band} a`);
  await expect(buttons.nth(0)).toHaveAttribute("href", "/contact");
  await expect(buttons.nth(1)).toHaveAttribute("href", "/properties");
  await expect(buttons.nth(0)).toHaveCSS("color", OFF_WHITE);
});

test("a home document with NO hero slice still opens on the dark ground the bar floats over", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${HOME}?bare`);
  await adopted(page);

  await expect(page.locator(band), "no slice, no band").toHaveCount(0);
  await expect(page.locator(pin)).toHaveCount(1);
  await expect(page.locator(pin)).toHaveCSS("height", "528px");
  await expect(page.locator(pin)).toHaveCSS("background-color", DARK);
  expect((await page.locator(pin).boundingBox())!.y).toBe(0);
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
});

test("with scripting off the hero still pins — it is CSS, not behaviour", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 600 },
  });
  try {
    const page = await context.newPage();
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    // Not adopted: the floating bar stays `absolute` and will leave with the page.
    await expect(page.locator(bar)).toHaveCSS("position", "absolute");

    const bandAtRest = (await page.locator(band).boundingBox())!.y;
    await page.mouse.wheel(0, 200);
    await expect
      .poll(async () => (await page.locator(band).boundingBox())!.y, "the band moved")
      .toBeLessThan(bandAtRest);
    expect((await page.locator(pin).boundingBox())!.y, "and the hero did not").toBe(0);
    const cutoutBox = (await page.locator(cutout).boundingBox())!;
    const bandBox = (await page.locator(band).boundingBox())!;
    expect(cutoutBox.y + cutoutBox.height).toBeCloseTo(bandBox.y, 1);
  } finally {
    await context.close();
  }
});
