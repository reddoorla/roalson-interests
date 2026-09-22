import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The homepage's photo band makes promises jsdom cannot check (see
// src/lib/slices/PhotoBand/index.svelte and the `[data-pinned-band]` block in
// src/app.css):
//
//  1. it PINS while the footer — which is outside <main> — slides up over it;
//  2. it costs the document nothing: the footer sits exactly where it would
//     have, before and after the footer's height arrives at hydration;
//  3. a window SHORTER than the band seats the band on its bottom edge, so the
//     footer is on screen for every pixel of the pin;
//  4. under reduced motion, without script, or anywhere but last in <main>, it
//     is a plain band that scrolls away, on a complete page.
//
// /dev/home is the home route's own markup over fixture data, through the real
// layout. `/` answers 404 until the Prismic repo is wired and /dev/* 404s on
// every production build — so NONE of this is verified on a production build
// yet. That is issue #28's, not an oversight here.
//
// TWO THINGS THE SHARED HARNESS FORCES, both of which would make this file
// vacuous if ignored:
//
// - `contextOptions.reducedMotion: "reduce"` on every test. The pin is OFF
//   under `reduce` by design, so the pin tests opt out with `test.use` — and
//   every PIN test asserts the media query it believes it is running under
//   (the mid-page, gradient/photo and axe cases do not; they do not move).
// - Under `no-preference` app.css makes `window.scrollTo(0, y)` a smooth,
//   animated scroll. Every scroll here is `behavior: "instant"`, then polled.
//
// And the lessons nav.spec.ts paid for: headless Chromium lays out 15px
// narrower than its window, so no x is derived from the window — every
// position is an element's own rect; sizes after a resize auto-retry; nothing
// is read before script has provably run.
const HOME = "/dev/home";

const BAND = "[data-pinned-band]";
const SPACER = ".pinned-band-spacer";

const GARNET = "rgb(101, 35, 35)";
const DARK = "rgb(61, 7, 7)";

/** Positive evidence of hydration: only the footer's own effect writes this. */
const hydrated = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--footer-h")))
    .toMatch(/^\d+(\.\d+)?px$/);

const motion = (page: Page) =>
  page.evaluate(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference",
  );

/** Viewport rects of the three boxes the mechanism is made of, and the page. */
const read = (page: Page) =>
  page.evaluate(
    ([bandSel, spacerSel]) => {
      const rect = (el: Element | null) => {
        if (!el) throw new Error("missing element");
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
      };
      const footer = document.querySelector("footer");
      return {
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        reach: document.documentElement.scrollHeight - window.innerHeight,
        docHeight: document.documentElement.scrollHeight,
        band: rect(document.querySelector(bandSel)),
        spacer: rect(document.querySelector(spacerSel)),
        footer: rect(footer),
        footerMargin: getComputedStyle(footer!).marginTop,
      };
    },
    [BAND, SPACER],
  );

/** Instant, then wait until the page has actually arrived. Clamped reads (the
 *  end of the page can be a fraction short of an integer) are the caller's. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(y, 0);
}

/** Is the topmost element at this viewport point inside `selector`? */
const hit = (page: Page, selector: string, x: number, y: number) =>
  page.evaluate(
    ([sel, px, py]) =>
      Boolean(document.elementFromPoint(px as number, py as number)?.closest(sel as string)),
    [selector, x, y] as const,
  );

async function open(page: Page, width: number, height: number, url = HOME) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await hydrated(page);
  await expect(page.locator(BAND)).toHaveCount(1);
  await expect(page.locator(SPACER)).toHaveCount(1);
}

test.describe("with motion allowed", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("at 1440 the band pins under the bar while the footer slides up over it", async ({
    page,
  }) => {
    await open(page, 1440, 900);
    expect(await motion(page), "this block must NOT run under the harness's reduce").toBe(
      "no-preference",
    );
    await expect(page.locator(BAND)).toHaveCSS("height", "800px");
    await expect(page.locator(BAND)).toHaveCSS("position", "sticky");

    // At rest. The spacer is the footer's height — a real one, not jsdom's 0 —
    // and the footer is laid back over it: its top is the band's bottom, and
    // the document ends where the footer ends.
    const rest = await read(page);
    expect(rest.scrollY).toBe(0);
    expect(rest.footer.height, "a real footer").toBeGreaterThan(400);
    expect(Math.abs(rest.spacer.height - rest.footer.height)).toBeLessThan(0.05);
    expect(Math.abs(rest.footer.top - rest.band.bottom), "footer on the band's heel").toBeLessThan(
      0.5,
    );
    expect(rest.docHeight - (rest.footer.bottom + rest.scrollY), "no extra page").toBeLessThan(1);

    // The pin needs room to be scrolled through, so that is checked, not
    // assumed: the fixture grows a band per batch and the footer changes.
    const pinStart = Math.round(rest.band.top);
    expect(rest.reach - pinStart, "the page scrolls well past the pin's start").toBeGreaterThan(
      350,
    );

    await scrollTo(page, pinStart + 100);
    const early = await read(page);
    await scrollTo(page, pinStart + 300);
    const late = await read(page);

    // Positive evidence, all three: the page moved, the footer moved with it,
    // and the band did NOT.
    expect(late.scrollY - early.scrollY).toBe(200);
    expect(early.footer.top - late.footer.top, "the footer scrolls normally").toBeCloseTo(200, 1);
    expect(early.band.top, "pinned").toBeCloseTo(0, 2);
    expect(late.band.top, "still pinned").toBeCloseTo(0, 2);
    expect(late.footer.top, "so the footer now overlaps it").toBeLessThan(late.band.bottom - 250);

    // …and it is the FOOTER that paints in the overlap, the band just above it.
    const x = late.band.left + late.band.width / 2;
    expect(await hit(page, "footer", x, late.footer.top + 10), "footer over the band").toBe(true);
    expect(await hit(page, BAND, x, late.footer.top - 10), "band above the footer").toBe(true);

    // To the very end of the page: still pinned, the footer's foot on the
    // window's. (900 is taller than the band, so nothing pushes it.)
    await scrollTo(page, rest.reach);
    const end = await read(page);
    expect(end.band.top, "pinned to the end").toBeCloseTo(0, 2);
    expect(end.footer.top).toBeLessThan(end.band.bottom);
    expect(Math.abs(end.footer.bottom - end.innerHeight)).toBeLessThan(1);
  });

  test("in a window SHORTER than the band it seats on the bottom edge — the footer is in view for every pixel of the pin", async ({
    page,
  }) => {
    // Most laptops: 1440×900 minus the browser's own chrome is under 800. With
    // `top: 0` here the band pinned with its foot AND the footer below the
    // fold — 150px of scrolling with nothing on screen moving — and then lost
    // the pin for the last 150px of the page.
    await open(page, 1440, 650);
    expect(await motion(page)).toBe("no-preference");
    await expect(page.locator(BAND)).toHaveCSS("height", "800px");

    const rest = await read(page);
    const seat = rest.innerHeight - rest.band.height;
    expect(seat, "the window really is shorter than the band").toBeLessThan(-100);
    const bandTop = rest.band.top + rest.scrollY;

    // The moment the band's foot reaches the window's, it holds — and that is
    // the same moment the footer arrives.
    // `Math.round`, and the footer is 512.56 tall, so the scroll position this
    // walks from is up to half a pixel off the exact moment of engagement.
    // Under a pixel is "seated"; sub-0.05 was a promise about fractional
    // layout that the page cannot keep, and it came due the day another band
    // was added to this fixture and moved everything by 0.48px.
    const SEATED = 1;
    const pinStart = Math.round(bandTop - seat);
    await scrollTo(page, pinStart);
    const engaged = await read(page);
    expect(Math.abs(engaged.band.bottom - engaged.innerHeight)).toBeLessThan(SEATED);
    expect(Math.abs(engaged.footer.top - engaged.innerHeight)).toBeLessThan(SEATED);

    // Walk the whole pin. At every step the band has not moved and the footer
    // HAS, in view — never a stretch where the visitor scrolls and sees nothing.
    let previous = engaged;
    for (let y = pinStart + 100; y < rest.reach; y += 100) {
      await scrollTo(page, y);
      const at = await read(page);
      expect(at.band.top, `held at y=${y}`).toBeCloseTo(seat, 2);
      expect(previous.footer.top - at.footer.top, `footer moved at y=${y}`).toBeCloseTo(100, 1);
      expect(at.footer.top, `footer on screen at y=${y}`).toBeLessThan(at.innerHeight);
      previous = at;
    }
    expect(previous.scrollY, "the walk covered a real distance").toBeGreaterThan(pinStart + 300);

    // And it never lets go. Under a pixel of slack: the footer is 512.56 tall,
    // the document rounds up to a whole pixel, and the last half-pixel of
    // scroll pushes the band by that much.
    await scrollTo(page, rest.reach);
    const end = await read(page);
    expect(Math.abs(end.band.top - seat), "pinned to the end").toBeLessThan(1);
  });

  test("at 390 the band is 240 tall, pins, and the footer ends up covering it whole", async ({
    page,
  }) => {
    await open(page, 1440, 900);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(BAND)).toHaveCSS("height", "240px");
    await expect
      .poll(async () => {
        const at = await read(page);
        return Math.abs(at.spacer.height - at.footer.height);
      }, "the spacer follows the footer's new height")
      .toBeLessThan(0.05);
    expect(await motion(page)).toBe("no-preference");

    await scrollTo(page, 0);
    const rest = await read(page);
    expect(rest.footer.height, "the phone's footer is the taller one").toBeGreaterThan(800);
    const pinStart = Math.ceil(rest.band.top);

    // The pinned hero above is 528 tall and this band 240: at the moment this
    // one pins, what shows under it must be the footer — not the hero, which is
    // bounded by its own section and long gone.
    await scrollTo(page, pinStart);
    const engaged = await read(page);
    const x = engaged.band.left + engaged.band.width / 2;
    expect(engaged.band.top).toBeCloseTo(0, 2);
    expect(await hit(page, "footer", x, engaged.band.bottom + 10)).toBe(true);

    await scrollTo(page, pinStart + 150);
    const moved = await read(page);
    expect(moved.band.top, "pinned").toBeCloseTo(0, 2);
    expect(engaged.footer.top - moved.footer.top).toBeCloseTo(150, 1);
    expect(moved.footer.top).toBeLessThan(moved.band.bottom);

    await scrollTo(page, rest.reach);
    const end = await read(page);
    expect(end.band.top, "pinned to the end").toBeCloseTo(0, 2);
    expect(end.footer.top, "the footer has passed the band's top").toBeLessThanOrEqual(0);
    expect(await hit(page, "footer", x, end.band.top + 120), "and paints over all of it").toBe(
      true,
    );
  });

  test("the band only pins as the LAST thing in <main> — mid-page it is a plain band and the footer keeps its place", async ({
    page,
  }) => {
    await open(page, 1440, 900);
    const band = page.locator(BAND);
    const footer = page.locator("footer");
    // Positive evidence first, or everything below could pass on a page where
    // the pin never worked.
    await expect(band).toHaveCSS("position", "sticky");
    await expect(footer).not.toHaveCSS("margin-top", "0px");

    // An editor drops a slice AFTER the band. Ungated, the band would stay
    // pinned over it (positioned beats unpositioned) and the footer would be
    // pulled up over the page's last 500px of content.
    await page.evaluate(() => {
      const after = document.createElement("section");
      after.id = "after-the-band";
      after.style.cssText = "height: 1200px; background: rgb(242, 239, 233)";
      document.querySelector("main")!.append(after);
    });
    await expect(band).toHaveCSS("position", "static");
    await expect(page.locator(SPACER)).toHaveCSS("height", "0px");
    await expect(footer).toHaveCSS("margin-top", "0px");

    const rest = await read(page);
    await scrollTo(page, Math.round(rest.band.top) + 400);
    const moved = await read(page);
    expect(moved.band.top, "the band scrolled away with the page").toBeCloseTo(-400, 0);
    const later = await page.locator("#after-the-band").boundingBox();
    expect(later!.y, "the later slice follows the band directly").toBeCloseTo(moved.band.bottom, 0);
    expect(
      await hit(page, "#after-the-band", moved.band.left + moved.band.width / 2, later!.y + 20),
      "and nothing paints over it",
    ).toBe(true);
    const footerBox = await footer.boundingBox();
    expect(footerBox!.y, "the footer starts where the later slice ends").toBeCloseTo(
      later!.y + later!.height,
      0,
    );
  });

  test("empty, the band is the brand gradient; with a photo, the picture fills it anchored to its BOTTOM edge", async ({
    page,
  }) => {
    await open(page, 1440, 900);
    const band = page.locator(BAND);
    await expect(band.locator("img")).toHaveCount(0);
    const ground = await band.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(ground).toMatch(/^linear-gradient\(/);
    expect(ground).not.toMatch(/to (top|left|right)|\ddeg/);
    expect(ground.indexOf(GARNET), ground).toBeGreaterThan(-1);
    expect(ground.indexOf(DARK), ground).toBeGreaterThan(ground.indexOf(GARNET));

    await open(page, 1440, 900, `${HOME}?photo`);
    const img = page.locator(`${BAND} img`);
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute("loading", "lazy");
    await expect(img).toHaveAttribute("alt", /skyline/);
    await expect(img).toHaveCSS("object-fit", "cover");
    await expect(img).toHaveCSS("object-position", "50% 100%");
    // Lazy: bring it into view, then wait for real pixels.
    await scrollTo(page, Math.round((await read(page)).band.top));
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(2880);

    const fit = await img.evaluate((el: HTMLImageElement) => {
      const [i, b] = [el.getBoundingClientRect(), el.parentElement!.getBoundingClientRect()];
      return {
        dx: Math.abs(i.left - b.left) + Math.abs(i.width - b.width),
        dy: Math.abs(i.top - b.top) + Math.abs(i.height - b.height),
        // What `cover` has to lose, all of it off the top: the comp's 160.1 at
        // a 1440 layout (3:2 → 960.1 tall in an 800 band).
        overhang: (b.width * el.naturalHeight) / el.naturalWidth - b.height,
      };
    });
    expect(fit.dx, "the picture is as wide as the band").toBeLessThan(0.5);
    expect(fit.dy, "and as tall").toBeLessThan(0.5);
    expect(fit.overhang, "a 3:2 source overhangs an 800px band at this width").toBeGreaterThan(100);
    // The photo never competes with the hero for the LCP.
    await expect(page.locator('head link[rel="preload"][as="image"]')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(band).toHaveCSS("height", "240px");
    await expect(img).toHaveCSS("object-position", "50% 100%");
  });

  test("with scripting off nothing writes --footer-h: the band scrolls away on a whole page", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      reducedMotion: "no-preference",
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      expect(await motion(page)).toBe("no-preference");
      // Read where the footer would have written it. (Not `page.content()`:
      // the dev server inlines app.css, which names the property to READ it.)
      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--footer-h"),
        ),
      ).toBe("");

      // The rules still match — the band IS sticky — but both lengths fall
      // back to 0, so it has no room to travel and the footer keeps its place.
      await expect(page.locator(BAND)).toHaveCSS("position", "sticky");
      await expect(page.locator(SPACER)).toHaveCSS("height", "0px");
      await expect(page.locator("footer")).toHaveCSS("margin-top", "0px");

      const rest = await read(page);
      expect(Math.abs(rest.footer.top - rest.band.bottom)).toBeLessThan(0.5);
      await scrollTo(page, Math.round(rest.band.top) + 300);
      const moved = await read(page);
      expect(moved.band.top, "the band left with the page").toBeCloseTo(-300, 0);
      expect(
        Math.abs(moved.footer.top - moved.band.bottom),
        "footer still on its heel",
      ).toBeLessThan(0.5);
      await expect(page.locator("footer").getByRole("heading", { level: 2 })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("under prefers-reduced-motion: reduce (what the shared config forces)", () => {
  test("the band does not pin: it scrolls away, the footer under it, and no room is reserved", async ({
    page,
  }) => {
    await open(page, 1440, 900);
    expect(await motion(page)).toBe("reduce");

    // Hydrated — the footer HAS published its height — and still nothing reads it.
    await expect(page.locator(BAND)).toHaveCSS("position", "static");
    await expect(page.locator(BAND)).toHaveCSS("height", "800px");
    await expect(page.locator(SPACER)).toHaveCSS("height", "0px");
    await expect(page.locator("footer")).toHaveCSS("margin-top", "0px");

    const rest = await read(page);
    expect(Math.abs(rest.footer.top - rest.band.bottom)).toBeLessThan(0.5);
    expect(rest.docHeight - (rest.footer.bottom + rest.scrollY), "no extra page").toBeLessThan(1);

    await scrollTo(page, Math.round(rest.band.top) + 300);
    const moved = await read(page);
    expect(moved.band.top, "the band left with the page").toBeCloseTo(-300, 0);
    expect(Math.abs(moved.footer.top - moved.band.bottom), "no overlap").toBeLessThan(0.5);
  });

  test("the band has no axe violations, and the photo's alt was actually looked at", async ({
    page,
  }) => {
    await open(page, 1440, 900, `${HOME}?photo`);
    const results = await new AxeBuilder({ page })
      .include(BAND)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    // A rule that threw is not a pass, and an empty `violations` must not mean
    // "never looked" (tests/a11y/fixtures.spec.ts insists on both halves).
    const crashed = results.incomplete.flatMap((rule) =>
      rule.nodes.flatMap((node) =>
        [...node.any, ...node.all, ...node.none].filter((check) => check.id === "error-occurred"),
      ),
    );
    expect(crashed).toEqual([]);
    const alt = results.passes.find((rule) => rule.id === "image-alt");
    expect(alt?.nodes.length ?? 0, "image-alt measured no image in the band").toBe(1);
    expect(results.violations).toEqual([]);
  });
});
