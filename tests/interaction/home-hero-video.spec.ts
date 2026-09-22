import { expect, test, type Page } from "@playwright/test";
import { hydrated } from "./hydrated";

// The homepage hero's video layer (#29) in a real engine. What is here is the
// half jsdom cannot decide: whether the layer exists at all under the two
// motion settings, whether the page can be tabbed into a decorative iframe, and
// whether the layer changed the 528px pin it sits in.
//
// WHAT IS DELIBERATELY NOT HERE. Revealing the video needs a heartbeat from a
// real player.vimeo.com iframe, so a browser assertion about the revealed state
// would put a third party on the critical path of every CI run. The reveal, the
// watchdog and the WCAG 2.2.2 control are HeroBackgroundVideo.test.ts's, where
// the beat can be posted exactly as the player posts one. The player was driven
// end to end by hand on a production preview once, and the numbers are in the
// journal entry for 2026-09-21 — a measurement, not a gate.
//
// THE TRAP THIS FILE IS WRITTEN AGAINST. The shared Playwright config sets
// `contextOptions.reducedMotion: "reduce"` on EVERY test, which is exactly the
// setting under which this component does nothing — so a whole file of video
// tests would pass while measuring an empty div. Every test below states the
// setting it believes it is running under and asserts it before it asserts
// anything else, and the cases that need motion opt out with `test.use`.
// `newContext` inherits nothing from `test.use`, so the script-off case sets
// its own.
const HOME = "/dev/home";
const VIDEO = "/dev/home?video";
const ID = "1229048743";

const section = '[data-slice-type="home_hero"]';
const pin = `${section} [data-home-hero-pin]`;
const layer = `${section} [data-hero-video]`;
const seat = `${section} [data-hero-video-controls]`;
const toggle = "[data-hero-video-toggle]";

const motion = (page: Page) =>
  page.evaluate(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference",
  );

/** A genuine first input. The layer's gate wants a real pointer event, not a
 *  synthetic one, and deliberately ignores `scroll` (an automated audit
 *  scrolls). `mouse.move` twice: the first is the pointer arriving.
 *
 *  The coordinates are small on purpose. At (400, 300) this silently did
 *  nothing on a 390-wide viewport — the pointer was off the page, no event
 *  fired, and the iframe never appeared. Inside the narrowest viewport this
 *  file uses, it fires everywhere. */
async function engage(page: Page) {
  await page.mouse.move(100, 200);
  await page.mouse.move(120, 220);
}

test("with no id the layer is not in the page at all", async ({ page }) => {
  await page.goto(HOME);
  await hydrated(page);
  await expect(page.locator(layer)).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("under the forced reduce, the hero with a video id is the hero without one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(VIDEO);
  await hydrated(page);
  expect(await motion(page), "the shared config's forced setting").toBe("reduce");

  // The layer IS rendered — that is what tells "reduced motion declined the
  // iframe" apart from "no id was configured", which look the same otherwise.
  await expect(page.locator(layer)).toHaveCount(1);

  // …and it stays empty however much the visitor engages.
  await engage(page);
  await page.mouse.wheel(0, 120);
  await page.keyboard.press("Tab");
  await expect(page.locator(`${layer} iframe`)).toHaveCount(0);
  await expect(page.locator(toggle)).toHaveCount(0);

  // The band is untouched: same height, same ground, same (non-)pin ruling.
  const box = (await page.locator(pin).boundingBox())!;
  expect(box.height).toBe(528);
  await expect(page.locator(pin)).toHaveCSS("background-color", "rgb(61, 7, 7)");
  await expect(page.locator(pin)).toHaveCSS("position", "relative");
});

// THE REGRESSION THIS FILE EXISTS FOR. The pause control first shipped with
// its placement classes on the button, after `ARROW_SHAPE` in the class string.
// `ARROW_SHAPE` opens with `relative` (a carousel arrow needs it to seat its
// `before:` hit area in a flex row), and a class ATTRIBUTE's order does not
// decide Tailwind's cascade — the stylesheet's does, and it emits `relative`
// after `absolute`. So `relative` won, `bottom-5 right-5` became offsets from a
// static position, and the control rendered at (-80, -20): off the page,
// focusable, and unmeasurable in jsdom, which resolves no stylesheets.
//
// The seat is asserted rather than the button so this needs no player: it ships
// whenever the layer does. Under the forced `reduce`, where the button never
// appears, this still fails the moment the corner moves.
test("the control's corner is inside the band, bottom-right, at the gutter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto(VIDEO);
  await hydrated(page);

  const boxes = await page.evaluate(
    ([seatSel, pinSel]) => {
      const s = document.querySelector(seatSel)!.getBoundingClientRect();
      const p = document.querySelector(pinSel)!.getBoundingClientRect();
      return { s: { right: s.right, bottom: s.bottom }, p: { right: p.right, bottom: p.bottom } };
    },
    [seat, pin],
  );
  // xl:right-20 / bottom-5 — the band's own gutter at 1440, and 20 up from its
  // foot. Inside the band on both axes, which (-80, -20) was not.
  expect(boxes.p.right - boxes.s.right, "80 in from the band's right edge").toBeCloseTo(80, 0);
  expect(boxes.p.bottom - boxes.s.bottom, "20 up from the band's foot").toBeCloseTo(20, 0);

  // At 390 the gutter is 20 (px-5), the same one the band's content uses.
  // Polled, not read once: a resize is not laid out by the time it returns —
  // read straight after, this said 80 on a 390 viewport (the 1440 value, one
  // frame stale) and failed a correct component.
  await page.setViewportSize({ width: 390, height: 700 });
  await expect
    .poll(
      () =>
        page.evaluate(
          ([seatSel, pinSel]) => {
            const s = document.querySelector(seatSel)!.getBoundingClientRect();
            const p = document.querySelector(pinSel)!.getBoundingClientRect();
            return Math.round(p.right - s.right);
          },
          [seat, pin],
        ),
      "20 in from the band's right edge at 390",
    )
    .toBe(20);
});

test.describe("with motion allowed", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the embed is created on first input, and not before it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto(VIDEO);
    await hydrated(page);
    expect(await motion(page), "opted out of the shared config").toBe("no-preference");

    // Nothing yet: the gate wants a real input, so an automated audit never
    // pays for the embed (and Vimeo's __cf_bm cookie stays out of its load).
    await expect(page.locator(`${layer} iframe`)).toHaveCount(0);

    await engage(page);
    const iframe = page.locator(`${layer} iframe`);
    await expect(iframe).toHaveCount(1);
    await expect(iframe).toHaveAttribute(
      "src",
      `https://player.vimeo.com/video/${ID}?background=1&muted=1&loop=1&autoplay=1&dnt=1`,
    );
    // Transparent until playback actually progresses — the ground still shows.
    await expect(iframe).toHaveCSS("opacity", "0");
  });

  test("the decorative embed is not a tab stop, and the pin is unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto(VIDEO);
    await hydrated(page);
    await engage(page);
    await expect(page.locator(`${layer} iframe`)).toHaveCount(1);

    // The pin is still the pin: 528 tall, sticky under motion (#38), and the
    // layer has not given the section a scrollport or a new height.
    await expect(page.locator(pin)).toHaveCSS("position", "sticky");
    expect((await page.locator(pin).boundingBox())!.height).toBe(528);

    // Twelve tabs from the top of the document: the iframe must never take one,
    // and neither must anything inside the layer.
    const visited: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      visited.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return "none";
          const inLayer = el.closest("[data-hero-video]") ? " (in-layer)" : "";
          return `${el.tagName.toLowerCase()}${inLayer}`;
        }),
      );
    }
    expect(visited.join(", ")).not.toContain("iframe");
    expect(visited.join(", ")).not.toContain("in-layer");
  });

  test("the embed covers the 528 band at every width, cropping at the sides", async ({ page }) => {
    // 528 x 16/9 = 938.67, so the floor is 939: below that the clip is sized by
    // height and the pin's own overflow-hidden takes the sides; above it, by
    // width. Read from the element, never from window.innerWidth — the runner
    // lays out narrower than it reports (nav.spec.ts paid for that lesson).
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(VIDEO);
      await hydrated(page);
      await engage(page);
      const iframe = page.locator(`${layer} iframe`);
      await expect(iframe).toHaveCount(1);

      const size = await iframe.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const band = el.closest("[data-home-hero-pin]")!.getBoundingClientRect();
        return { w: r.width, h: r.height, bandW: band.width, bandH: band.height };
      });
      expect(
        size.w,
        `${width}: at least the 939 floor and at least the band`,
      ).toBeGreaterThanOrEqual(Math.max(939, size.bandW) - 0.5);
      expect(size.h, `${width}: covers the band's full height`).toBeGreaterThanOrEqual(
        size.bandH - 0.5,
      );
      // 16:9, so it is the clip's own frame that is being cropped, not squashed.
      expect(size.w / size.h).toBeCloseTo(16 / 9, 2);
    }
  });
});

test("with scripting off the hero is the ground it always was", async ({ browser }) => {
  // Its own context, so it states its own motion setting: `newContext`
  // inherits nothing from `test.use`.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "no-preference",
    viewport: { width: 1440, height: 600 },
  });
  try {
    const page = await context.newPage();
    await page.goto(VIDEO, { waitUntil: "domcontentloaded" });
    // The layer ships in the server's markup (it is the div, not the player),
    // and nothing inside it does.
    await expect(page.locator(layer)).toHaveCount(1);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator(toggle)).toHaveCount(0);
    await expect(page.locator(pin)).toHaveCSS("position", "sticky");
    expect((await page.locator(pin).boundingBox())!.height).toBe(528);
  } finally {
    await context.close();
  }
});
