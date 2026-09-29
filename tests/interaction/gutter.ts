import { test, type Browser } from "@playwright/test";

// THE VIEWPORT THAT PRODUCES A GIVEN LAYOUT WIDTH, for the specs that assert
// the comp's absolute numbers. It lives here, beside hydrated.ts, because
// featured-properties.spec.ts and home-hero.spec.ts each typed the same
// `layoutWidth + 15`, home-hero-live.spec.ts typed its results (1455, 961,
// 945), and that 15 is not a constant (#124).
//
// app.css keeps `scrollbar-gutter: stable` on html, which reserves a CLASSIC
// scrollbar's width and nothing for an OVERLAY one. Linux headless Chromium
// has classic scrollbars: 15px, so a 1455 window lays the page out at 1440. A
// Mac set to "Show scroll bars: automatically" has overlay ones on a trackpad
// and classic ones with a mouse plugged in, so the same tree went red and
// green in one session with nothing in the repo changed — `text.left` read
// 436.89 against the comp's 434. Reproduced on Linux with
// `--enable-features=OverlayScrollbar`: gutter 0, the same 436.890625.
//
// So the gutter is MEASURED, once per worker, and never typed.
//
// WHAT IT IS MEASURED AS. `innerWidth - documentElement.getBoundingClientRect()
// .width`: the root's box is the width the page is laid out in. NOT
// `innerWidth - clientWidth`, which #124 proposed and which a bare page does
// answer correctly (15 classic, 0 overlay) — but on /dev/home, at a 1455
// window with 15px reserved, `clientWidth` reads 1455 while html lays out at
// 1440 (measured 2026-09-28), so on this site that difference is 0 on the very
// runner where the gutter is 15. nav.spec.ts found the same on CI.

let measured: number | undefined;

/** Reads the gutter off a bare page wearing app.css's `scrollbar-gutter:
 *  stable` over content that scrolls. */
async function measureGutter(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  try {
    const page = await context.newPage();
    await page.setContent(
      '<html style="scrollbar-gutter: stable"><body style="margin: 0"><div style="height: 5000px"></div></body></html>',
    );
    return await page.evaluate(
      () => window.innerWidth - document.documentElement.getBoundingClientRect().width,
    );
  } finally {
    await context.close();
  }
}

/** Call at a spec's top level: measures the gutter before its first test. */
export function measuresGutter() {
  test.beforeAll(async ({ browser }) => {
    measured = await measureGutter(browser);
  });
}

/** The measured gutter. Throws until the spec has called `measuresGutter()`,
 *  rather than guessing. */
export function gutter() {
  if (measured === undefined)
    throw new Error("gutter: call measuresGutter() at this spec's top level");
  return measured;
}

/** The viewport that lays the page out `layoutWidth` wide. */
export const viewportFor = (layoutWidth: number, height = 900) => ({
  width: layoutWidth + gutter(),
  height,
});
