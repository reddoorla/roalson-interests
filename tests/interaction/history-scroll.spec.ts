import { expect, test } from "@playwright/test";
import { HYDRATION_TIMEOUT } from "./hydrated";

// BACK AND FORWARD JUMP; THEY DO NOT GLIDE.
//
// app.css sets `html { scroll-behavior: smooth }`, and $lib/utils/instantNavScroll
// turns it off around kit's own post-navigation scroll so a history step lands
// in one frame. On kit 3 that stopped holding for an entry saved at the top:
// kit scrolls while the swapped-in page's layout is dirty, Chromium applies the
// scroll at the next layout, after smooth was restored, and Back from
// /properties at y=1500 to /team/matt-howard glided 863→0 over ~30 frames
// (roalson-interests#306). The layout's flushLayoutForKitScroll effect is the
// fix; deleting it turns this red.
//
// Nightly tier, not @smoke: it samples per-frame scroll positions.
//
// IT NEEDS A PRODUCTION BUILD. Under `vite dev` the scroll lands in one frame
// with or without the fix (measured: 3 of 3 green with the effect deleted), so
// on the dev server this spec skips itself rather than pass on nothing. Run it
// with the gate's preview server:
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/history-scroll.spec.ts
// Measured that way: 3 of 3 green with the fix, red without it (the 29-frame
// 863→0 glide).
//
// `reducedMotion: "no-preference"` is required. The shared Playwright config
// forces `reduce`, and app.css's reduced-motion block sets scroll-behavior to
// auto, so a spec that inherits it can never see a glide.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

test("Back to an entry saved at the top lands in one frame", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __ys: number[] };
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
  await page.goto("/team/matt-howard");
  // Vite's dev server serves its client module; a production build does not.
  const onDevServer = (await page.request.get("/@vite/client")).ok();
  test.skip(
    onDevServer,
    "needs a production build: REDDOOR_GATE_SERVER=preview (the glide does not reproduce under vite dev)",
  );
  await page.waitForSelector("html[data-hydrated]", { timeout: HYDRATION_TIMEOUT });

  // A client-side link to a page long enough to scroll well past the viewport.
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "/properties";
    a.id = "history-scroll-probe";
    a.textContent = "properties";
    a.style.cssText = "position:fixed;top:0;left:0;z-index:99999";
    document.body.appendChild(a);
  });
  await page.click("#history-scroll-probe");
  await page.waitForURL("**/properties");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => scrollTo({ top: 1500, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400);
  // Clear the trace only once the sampler has recorded where we are, or the
  // last pre-Back position lands in the trace as if Back had produced it.
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __ys: number[] }).__ys.at(-1) === Math.round(scrollY),
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    (window as unknown as { __ys: number[] }).__ys = [];
  });
  await page.goBack();
  await page.waitForURL("**/team/matt-howard");
  // Long enough for a smooth scroll to finish, so a glide is fully recorded.
  await page.waitForTimeout(1500);
  const ys = await page.evaluate(() => (window as unknown as { __ys: number[] }).__ys);

  expect(ys.at(-1), "Back ends at the saved position").toBe(0);
  expect(ys, "every recorded position after Back is the target: a jump, not a glide").toEqual([0]);
});
