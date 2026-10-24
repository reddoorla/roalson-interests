import { expect, test, type Page } from "@playwright/test";
import { HYDRATION_TIMEOUT } from "./hydrated";

// KIT'S OWN SCROLLS LAND; THEY DO NOT GLIDE, DRIFT, OR FIGHT THE VISITOR.
//
// app.css sets `html { scroll-behavior: smooth }`. Kit 3 broke the places
// where kit's own scroll must land in one frame regardless
// (roalson-interests#306), and each fix had to keep the next case intact:
//
//   - Back/Forward to an entry saved at the top. Kit 3 scrolls while the new
//     page's layout is dirty, Chromium applies it after instantNavScroll has
//     put smooth back, and it glided (863→0 over ~30 frames). Fixed by the root
//     layout's flushLayoutForKitScroll effect. INTERMITTENT: with the effect
//     deleted this test went red in 3 of 6 runs, and every red was Back #1 (a
//     later Back in the same page never glided). So one run is a coin flip:
//     run it with --repeat-each 5 (about 97% to catch it) when checking a
//     change to scrolling. With the fix it was green 10 of 10.
//   - A reload (or a Back from another site) to a scrolled page. Kit 3 restores
//     the position with its own scrollTo at startup, before any component
//     mounts: it glided up from 0 (~36 frames), and once made instant it
//     drifted 112px (1500→1612) when scroll anchoring followed hydration
//     shrinking /properties. Fixed by app.css's pre-hydration
//     `scroll-behavior: auto` and `overflow-anchor: none`.
//   - A visitor who scrolls while a slow page is still hydrating keeps that
//     position. A fix that re-applied kit's target after hydration snapped
//     them back to it (2000→800, round 4).
//
// A MANUAL, PRODUCTION-BUILD INSTRUMENT. Neither glide reproduces under
// `vite dev`, so on the dev server this spec skips itself rather than pass on
// nothing, and the nightly workflow runs the dev server, so it is not in
// `test:nightly`. Run it with the gate's preview server:
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/history-scroll.spec.ts --repeat-each 5
//
// `reducedMotion: "no-preference"` is required. The shared Playwright config
// forces `reduce`, and app.css's reduced-motion block sets scroll-behavior to
// auto, so a spec that inherits it can never see a glide.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

type Traced = Window & { __ys: number[] };

async function traceScroll(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Traced;
    w.__ys = [];
    let last = -1;
    const tick = () => {
      if (scrollY !== last) {
        last = scrollY;
        w.__ys.push(Math.round(scrollY));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector("html[data-hydrated]", { timeout: HYDRATION_TIMEOUT });
  // Vite's dev server serves its client module; a production build does not.
  test.skip(
    (await page.request.get("/@vite/client")).ok(),
    "needs a production build: REDDOOR_GATE_SERVER=preview (neither glide reproduces under vite dev)",
  );
}

/** A client-side link to `href`, clicked. */
async function follow(page: Page, href: string) {
  await page.evaluate((target) => {
    // It is appended to <body>, outside kit's tree, so it outlives a Back.
    document.getElementById("history-scroll-probe")?.remove();
    const a = document.createElement("a");
    a.href = target;
    a.id = "history-scroll-probe";
    a.textContent = target;
    a.style.cssText = "position:fixed;top:0;left:0;z-index:99999";
    document.body.appendChild(a);
  }, href);
  await page.click("#history-scroll-probe");
  await page.waitForURL(`**${href}`);
  await page.waitForLoadState("networkidle");
}

/** Scroll to y instantly, then clear the trace once the sampler has seen it,
 *  or the last pre-step position lands in the trace as if the step made it. */
async function scrollAndReset(page: Page, y: number) {
  await page.evaluate((top) => scrollTo({ top, behavior: "instant" }), y);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y / 2);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as Traced).__ys.at(-1) === Math.round(scrollY)),
    )
    .toBe(true);
  await page.evaluate(() => {
    (window as unknown as Traced).__ys = [];
  });
}

const trace = (page: Page) => page.evaluate(() => (window as unknown as Traced).__ys);

test("Back to an entry saved at the top lands in one frame, five times over", async ({ page }) => {
  await traceScroll(page);
  await open(page, "/team/matt-howard");
  for (let attempt = 1; attempt <= 5; attempt++) {
    await follow(page, "/properties");
    await scrollAndReset(page, 1500);
    await page.goBack();
    await page.waitForURL("**/team/matt-howard");
    // Long enough for a smooth scroll to finish, so a glide is fully recorded.
    await page.waitForTimeout(1200);
    expect(await trace(page), `Back #${attempt}: a jump to 0, not a glide`).toEqual([0]);
  }
});

test("a reload restores a scrolled page without gliding up from the top", async ({ page }) => {
  await traceScroll(page);
  await open(page, "/contact");
  await follow(page, "/properties");
  await scrollAndReset(page, 1500);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const ys = await trace(page);
  // Exactly where it was left: scroll anchoring once moved it 112px when
  // hydration shrank /properties from 14212px to 2487px (#306, round 3).
  expect(ys.at(-1), "the reload ends on the saved position").toBe(1500);
  // A fresh document starts at 0 and kit jumps it back; a glide passes through
  // every position in between (0, 2, 10, 24, 47 … 1497).
  expect(
    ys.filter((y) => y > 0 && y < 1400),
    "no position between the top and the target",
  ).toEqual([]);
});

test("a scroll made while a slow page is still hydrating is kept", async ({ page }) => {
  await traceScroll(page);
  await open(page, "/");
  await scrollAndReset(page, 800);
  // Hold back the page's own chunk so hydration lands 3s after kit's restore.
  await page.route(/\/_app\/immutable\/nodes\/([2-9]|\d\d)\.[^/]*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.reload({ waitUntil: "commit" });
  await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 10_000 }).toBe(800);
  expect(
    await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated")),
    "the visitor's scroll lands before hydration",
  ).toBe(false);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBeGreaterThan(1500);
  const scrolled = await page.evaluate(() => Math.round(scrollY));
  await page.waitForSelector("html[data-hydrated]", { timeout: HYDRATION_TIMEOUT });
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() => Math.round(scrollY)),
    "hydration keeps the visitor's position",
  ).toBe(scrolled);
});
