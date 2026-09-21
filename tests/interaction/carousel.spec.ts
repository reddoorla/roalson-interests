import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { expectRing, GARNET, OFF_WHITE } from "./expect-ring";

// The headless carousel ($lib/carousel.svelte.ts) makes four promises jsdom
// cannot check, and each of them was wrong at least once while it was built:
//
//  1. ONE CLOCK — the bar reaches the end on the frame the slide turns, in a
//     real browser's requestAnimationFrame, and a pause freezes both;
//  2. a real MOUSE press on Pause leaves it paused. Chromium focuses a button
//     on mousedown; that focus "enters the carousel", which stops rotation and
//     flips the control to Play — and a plain toggle on the click that follows
//     starts it again. (Measured on the starter's Slider: pressed on its rim
//     it does exactly that; pressed on its glyph it stays paused — why the
//     glyph differs was not isolated, and nothing here relies on it.)
//  3. the hit area is 44px. A unit test read `before:-inset-0.5` and called it
//     44; Chromium measured 42, because an absolute inset starts inside the
//     1px ring;
//  4. the bar's colours are 3:1 apart AS PAINTED — the track is an alpha, so
//     what reaches the screen is the compositor's arithmetic, not the token's;
//  5. keyboard focus is never left on <body>. jsdom has no `inert`, so the unit
//     tests passed while a slide that turned away took the focus it held with
//     it — by an arrow key pressed on the slide's own link, and by the clock
//     one dwell after Play → Tab into the slide. Found in review, not by a test;
//  6. the focus ring is the colour of the GROUND the carousel sits on. The
//     first version reasoned about a ring that was garnet everywhere; main had
//     replaced it (`--focus-ring`, app.css) before this merged.
//
// The shared config forces `reducedMotion: "reduce"` on every context, under
// which this carousel never rotates and has no pause control. Every test about
// rotation opens its OWN context with "no-preference"; inheriting the default
// would measure a carousel that is standing still and pass.
const FIXTURES = "/dev/a11y-fixtures";
/** Garnet controls on the sand card, autoplay 4000 + settle 500. */
const AUTO = '[data-carousel-fixture="garnet"]';
/** Cream controls on the garnet card, no autoplay. */
const MANUAL = '[data-carousel-fixture="cream"]';

const DWELL = 4000;
const SETTLE = 500;

/** Script has adopted the carousel: `hydrated`, which only an effect sets. A
 *  click before this lands on server markup and does nothing. */
const adopted = (region: Locator) => expect(region).toHaveAttribute("data-carousel-ready", "");

const barScale = (region: Locator) =>
  region
    .locator("[data-carousel-progress] > div")
    .evaluate((el) => Number(/scaleX\(([^)]+)\)/.exec(el.getAttribute("style") ?? "")?.[1]));

async function moving(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport });
  const page = await context.newPage();
  return { context, page };
}

/** Parks the pointer where it cannot hover the carousel — hover is a pause. */
const pointerAway = (page: Page) => page.mouse.move(2, 2);

type ArrowKey = { key: string; on: string; claimed: boolean };

/** Every arrow key from here on, as `window` sees it — the last stop of the
 *  bubble, after Svelte's delegated handler at the root has had its turn. "The
 *  slide did not turn" could be a key that never arrived; this says it arrived,
 *  on what, and whether anyone claimed it. */
const recordArrowKeys = (page: Page) =>
  page.evaluate(() => {
    const seen: { key: string; on: string; claimed: boolean }[] = [];
    (window as unknown as { __keys: typeof seen }).__keys = seen;
    window.addEventListener("keydown", (e) => {
      if (!e.key.startsWith("Arrow")) return;
      const el = e.target as HTMLElement;
      seen.push({
        key: e.key,
        on: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName,
        claimed: e.defaultPrevented,
      });
    });
  });

/** Where keyboard focus IS, by name ("BODY" when nothing holds it), with what
 *  the carousel says about itself — in ONE read. A test about lost focus has to
 *  name the element that has it: "the slide did not turn" is the absence of a
 *  symptom, and this defect was found with every such test green. */
const focusAnd = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const region = document.querySelector(sel)!;
    const el = document.activeElement;
    const live = region.querySelector("[aria-live]")!;
    return {
      focus:
        !el || el === document.body
          ? "BODY"
          : (el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName),
      inCarousel: !!el && el !== document.body && region.contains(el),
      status: live.textContent,
      live: live.getAttribute("aria-live"),
      firstControl: region.querySelector("button")!.getAttribute("aria-label"),
      keys: (window as unknown as { __keys?: ArrowKey[] }).__keys ?? [],
    };
  }, selector);

test("with scripting off it is slide 1, with no dead controls and nothing claiming to rotate", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(FIXTURES, { waitUntil: "domcontentloaded" });
    const region = page.locator(AUTO);

    await expect(region).toHaveAttribute("role", "region");
    await expect(region).toHaveAttribute("aria-roledescription", "carousel");
    await expect(region, "only script sets this").not.toHaveAttribute("data-carousel-ready", "");

    const slides = await region.locator('[role="group"]').evaluateAll((els) =>
      els.map((el) => ({
        label: el.getAttribute("aria-label"),
        inert: el.hasAttribute("inert"),
        hidden: el.getAttribute("aria-hidden"),
        opacity: getComputedStyle(el).opacity,
      })),
    );
    expect(slides).toEqual([
      { label: "1 of 3", inert: false, hidden: null, opacity: "1" },
      { label: "2 of 3", inert: true, hidden: "true", opacity: "0" },
      { label: "3 of 3", inert: true, hidden: "true", opacity: "0" },
    ]);

    // The controls ARE in the markup (so the row does not jump in at
    // hydration) and app.html's <noscript> rule is what hides them.
    await expect(region.locator("button")).toHaveCount(3);
    await expect(region.getByLabel("Next slide")).toBeHidden();
    await expect(region.locator("[data-carousel-progress]")).toBeHidden();
    await expect(region.getByText("Link in slide 1")).toBeVisible();
    await expect(region.locator("[aria-live]")).toHaveAttribute("aria-live", "polite");
  } finally {
    await context.close();
  }
});

test("the bar and the slide turn on one clock, and the bar waits out the dissolve", async ({
  browser,
}) => {
  const { context, page } = await moving(browser);
  try {
    // Sampled from before the first script, every frame: the bar's scale and
    // which slide is exposed.
    await page.addInitScript((selector) => {
      const w = window as unknown as { __carousel: { t: number; p: number; n: number }[] };
      w.__carousel = [];
      const tick = () => {
        const region = document.querySelector(selector);
        const fill = region?.querySelector("[data-carousel-progress] > div");
        const p = Number(/scaleX\(([^)]+)\)/.exec(fill?.getAttribute("style") ?? "")?.[1]);
        const n = [...(region?.querySelectorAll('[role="group"]') ?? [])].findIndex(
          (el) => el.getAttribute("aria-hidden") === null,
        );
        if (region?.hasAttribute("data-carousel-ready") && Number.isFinite(p))
          w.__carousel.push({ t: performance.now(), p, n });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, AUTO);
    await page.goto(FIXTURES);
    await pointerAway(page);
    await adopted(page.locator(AUTO));
    await page.waitForTimeout(DWELL + SETTLE + 1200);

    const samples = await page.evaluate(
      () => (window as unknown as { __carousel: { t: number; p: number; n: number }[] }).__carousel,
    );
    expect(samples.length, "sampled a running carousel").toBeGreaterThan(100);

    const turn = samples.findIndex((s, i) => i > 0 && s.n !== samples[i - 1].n);
    expect(turn, "the slide turned while we watched").toBeGreaterThan(0);
    expect(samples[turn - 1].n).toBe(0);
    expect(samples[turn].n).toBe(1);

    // The frame before the turn the bar was all but full; on the turn it is empty.
    // (0.9, not 0.99: a loaded CI runner may drop frames just before the turn;
    // measured on an idle machine the last frame read 0.9979–0.99998.)
    expect(samples[turn - 1].p).toBeGreaterThan(0.9);
    expect(samples[turn].p).toBe(0);
    // It filled for one dwell, and never ran backwards on the way.
    const firstDwell = samples[turn].t - samples[0].t;
    expect(Math.abs(firstDwell - DWELL), `first dwell was ${firstDwell}ms`).toBeLessThan(250);
    for (let i = 1; i < turn; i++) expect(samples[i].p).toBeGreaterThanOrEqual(samples[i - 1].p);

    // …then it holds at 0 through the dissolve and starts again.
    const after = samples.slice(turn);
    const restarts = after.find((s) => s.p > 0);
    expect(restarts, "the bar started its second dwell").toBeTruthy();
    const held = restarts!.t - samples[turn].t;
    expect(Math.abs(held - SETTLE), `held at 0 for ${held}ms`).toBeLessThan(150);
  } finally {
    await context.close();
  }
});

test("hover freezes the bar where it is, and leaving resumes from there", async ({ browser }) => {
  const { context, page } = await moving(browser);
  try {
    await page.goto(FIXTURES);
    await pointerAway(page);
    const region = page.locator(AUTO);
    await adopted(region);
    await region.scrollIntoViewIfNeeded();
    await expect.poll(() => barScale(region), "the bar is filling").toBeGreaterThan(0.05);

    // Hover the card's own padding, clear of every control.
    const box = (await region.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 6);
    await expect(region.locator("[aria-live]")).toHaveAttribute("aria-live", "polite");
    const frozen = await barScale(region);
    expect(frozen).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    expect(await barScale(region)).toBe(frozen);

    await pointerAway(page);
    await expect(region.locator("[aria-live]")).toHaveAttribute("aria-live", "off");
    await expect.poll(() => barScale(region)).toBeGreaterThan(frozen);
    // From where it was, not from the top: 700ms of hover would otherwise
    // show up as a bar that had restarted near zero.
    expect(await barScale(region)).toBeLessThan(frozen + 0.5);
  } finally {
    await context.close();
  }
});

for (const where of ["glyph", "rim"] as const) {
  test(`a real mouse press on Pause leaves it paused — pressed on the ${where}`, async ({
    browser,
  }) => {
    const { context, page } = await moving(browser);
    try {
      await page.goto(FIXTURES);
      await pointerAway(page);
      const region = page.locator(AUTO);
      await adopted(region);
      const toggle = region.locator("button").first();
      await expect(toggle).toHaveAttribute("aria-label", "Pause slides");

      // Both must hold. With the pause click mutated back to a plain toggle,
      // both of these went red.
      await toggle.click(where === "rim" ? { position: { x: 3, y: 20 } } : {});
      await pointerAway(page);

      await expect(toggle).toHaveAttribute("aria-label", "Play slides");
      await expect(region.locator("[aria-live]")).toHaveAttribute("aria-live", "polite");
      const frozen = await barScale(region);
      await page.waitForTimeout(700);
      expect(await barScale(region)).toBe(frozen);

      // …and the next press plays, from where it froze.
      await toggle.click(where === "rim" ? { position: { x: 3, y: 20 } } : {});
      await pointerAway(page);
      await expect(toggle).toHaveAttribute("aria-label", "Pause slides");
      await expect.poll(() => barScale(region)).toBeGreaterThan(frozen);
    } finally {
      await context.close();
    }
  });
}

test("keyboard: focus entering stops it, Play then Tab does not stop it again, arrows turn it", async ({
  browser,
}) => {
  const { context, page } = await moving(browser);
  try {
    await page.goto(FIXTURES);
    await pointerAway(page);
    const region = page.locator(AUTO);
    await adopted(region);
    const toggle = region.locator("button").first();

    // Pause is the first thing Tab reaches inside the carousel (APG).
    const first = await region.evaluate((el) =>
      el.querySelector("button, a[href]")!.getAttribute("aria-label"),
    );
    expect(first).toBe("Pause slides");

    await toggle.focus();
    await expect(toggle, "focus entered: rotation stopped").toHaveAttribute(
      "aria-label",
      "Play slides",
    );
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-label", "Pause slides");

    await page.keyboard.press("Tab");
    await expect(region.getByLabel("Previous slide")).toBeFocused();
    await expect(toggle, "focus moved WITHIN: still playing").toHaveAttribute(
      "aria-label",
      "Pause slides",
    );

    await page.keyboard.press("ArrowRight");
    await expect(region.locator('[role="group"]:not([aria-hidden])')).toHaveAttribute(
      "aria-label",
      "2 of 3",
    );
    // The slide that left is out of the tab order, not just transparent.
    expect(
      await region
        .locator('[role="group"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).inert)),
    ).toEqual([true, false, true]);
  } finally {
    await context.close();
  }
});

test("autoplay never turns a slide out from under keyboard focus", async ({ browser }) => {
  const { context, page } = await moving(browser);
  try {
    await page.goto(FIXTURES);
    await pointerAway(page);
    const region = page.locator(AUTO);
    await adopted(region);
    const toggle = region.locator("button").first();
    const status = region.locator("[aria-live]");
    const link = region.getByRole("link", { name: "Link in slide 1" });

    await toggle.focus();
    await expect(toggle).toHaveAttribute("aria-label", "Play slides");
    await page.keyboard.press("Enter");
    // Rotating, positively: it offers Pause, the live region is muted, and the
    // bar is moving. Without this the rest would pass on a carousel at rest.
    await expect(toggle).toHaveAttribute("aria-label", "Pause slides");
    await expect(status).toHaveAttribute("aria-live", "off");
    const before = await barScale(region);
    await expect.poll(() => barScale(region)).toBeGreaterThan(before);

    await page.keyboard.press("Tab"); // Previous
    await page.keyboard.press("Tab"); // Next
    await page.keyboard.press("Tab"); // the active slide's link
    await expect(link).toBeFocused();

    // Longer than a whole dwell and its settle. The first version turned the
    // slide inside this window — focus had only moved WITHIN the carousel, so
    // nothing paused it — and the link went inert with focus on it: measured
    // activeElement BODY, "Slide 2 of 3".
    await page.waitForTimeout(DWELL + SETTLE + 300);
    expect(await focusAnd(page, AUTO)).toEqual({
      focus: "Link in slide 1",
      inCarousel: true,
      status: "Slide 1 of 3",
      // Focus landed in a slide, so rotation stopped — and says so.
      live: "polite",
      firstControl: "Play slides",
      keys: [],
    });
  } finally {
    await context.close();
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the comp's numbers at ${viewport.width}: a 40px ring, a 44px target, a 2px bar`, async ({
    browser,
  }) => {
    const { context, page } = await moving(browser, viewport);
    try {
      await page.goto(FIXTURES);
      await pointerAway(page);
      const region = page.locator(AUTO);
      await adopted(region);
      await region.scrollIntoViewIfNeeded();
      const next = region.getByLabel("Next slide");
      const prev = region.getByLabel("Previous slide");

      await expect(next).toHaveCSS("width", "40px");
      await expect(next).toHaveCSS("height", "40px");
      await expect(next).toHaveCSS("border-top-width", "1px");
      await expect(next).toHaveCSS("border-top-color", "rgb(101, 35, 35)");
      await expect(next).toHaveCSS("color", "rgb(101, 35, 35)");
      await expect(next.locator("svg")).toHaveCSS("width", "25px");
      await expect(prev.locator("svg")).toHaveCSS("rotate", "180deg");
      await expect(region.locator("[data-carousel-progress]")).toHaveCSS("height", "2px");

      const m = await next.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const g = el.querySelector("svg")!.getBoundingClientRect();
        const p = el.previousElementSibling!.getBoundingClientRect();
        const at = (x: number, y: number) =>
          document.elementFromPoint(x, y)?.closest("button") === el;
        const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
        return {
          ring: [r.width, r.height],
          glyphInset: [g.left - r.left, g.top - r.top],
          gap: r.left - p.right,
          // 1.5px outside the ring on every side is still the button…
          inside: [
            at(r.left - 1.5, cy),
            at(r.right + 1.5, cy),
            at(cx, r.top - 1.5),
            at(cx, r.bottom + 1.5),
          ],
          // …and 3.5px outside is not: 44, not "the whole row".
          outside: [
            at(r.left - 3.5, cy),
            at(r.right + 3.5, cy),
            at(cx, r.top - 3.5),
            at(cx, r.bottom + 3.5),
          ],
        };
      });
      for (const side of m.ring) expect(side).toBeCloseTo(40, 3);
      for (const inset of m.glyphInset) expect(inset).toBeCloseTo(7.5, 3);
      expect(m.gap).toBeCloseTo(10, 3);
      expect(m.inside).toEqual([true, true, true, true]);
      expect(m.outside).toEqual([false, false, false, false]);
    } finally {
      await context.close();
    }
  });
}

// ── under the shared config's reduced motion ────────────────────────────────

test("under reduced motion there is no pause control, and the bar draws position", async ({
  page,
}) => {
  await page.goto(FIXTURES);
  const region = page.locator(AUTO);
  await adopted(region);
  // The server ships three buttons (it cannot know the preference); two left
  // is script having learned it.
  await expect(region.locator("button")).toHaveCount(2);
  const bar = region.locator("[data-carousel-progress]");
  await expect(bar).toHaveAttribute("data-carousel-progress", "position");
  await expect.poll(() => barScale(region)).toBeCloseTo(1 / 3, 5);
  await region.getByLabel("Next slide").click();
  await expect.poll(() => barScale(region)).toBeCloseTo(2 / 3, 5);
  await page.waitForTimeout(DWELL + SETTLE + 500);
  expect(await barScale(region), "and nothing rotated in the meantime").toBeCloseTo(2 / 3, 5);
});

test("an arrow key on a slide's link is the page's; on a control it turns the slide and focus stays put", async ({
  page,
}) => {
  await page.goto(FIXTURES);
  const region = page.locator(MANUAL);
  await adopted(region);
  const next = region.getByLabel("Next slide");
  const link = region.getByRole("link", { name: "Link in slide 1" });

  await recordArrowKeys(page);
  const onLink = { key: "ArrowRight", on: "Link in slide 1", claimed: false };
  const onNext = { key: "ArrowRight", on: "Next slide", claimed: true };
  const rest = { inCarousel: true, live: "polite", firstControl: "Previous slide" };

  await next.focus();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();

  // The first version turned the slide here. The slide that left was the one
  // holding focus; `inert` dropped it on <body>, and the next arrow key did
  // nothing at all.
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => focusAnd(page, MANUAL))
    .toEqual({ ...rest, focus: "Link in slide 1", status: "Slide 1 of 3", keys: [onLink] });

  // From a control the same key turns it — twice, because "the second press
  // does nothing" was the symptom — and focus is still ON that control.
  await page.keyboard.press("Shift+Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => focusAnd(page, MANUAL))
    .toEqual({ ...rest, focus: "Next slide", status: "Slide 2 of 3", keys: [onLink, onNext] });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => focusAnd(page, MANUAL))
    .toEqual({
      ...rest,
      focus: "Next slide",
      status: "Slide 3 of 3",
      keys: [onLink, onNext, onNext],
    });

  // Tab goes on into the slide that is showing NOW, not the one that left.
  await page.keyboard.press("Tab");
  await expect.poll(() => focusAnd(page, MANUAL).then((now) => now.focus)).toBe("Link in slide 3");
});

test("the focus ring follows the card the carousel sits on — arrows and slide links alike", async ({
  browser,
}) => {
  // Its own context: the arrows carry `transition-colors`, which lists
  // outline-color, and under the shared config's reduced motion app.css zeroes
  // every transition — the poll inside expectRing would have nothing to wait
  // out, and this would not be the read a sighted keyboard user gets.
  const { context, page } = await moving(browser);
  try {
    await page.goto(FIXTURES);
    await pointerAway(page);
    const garnetCard = page.locator(MANUAL);
    const sandCard = page.locator(AUTO);
    await adopted(garnetCard);
    await adopted(sandCard);
    // The grounds are what the names say, as painted…
    await expect(garnetCard).toHaveCSS("background-color", GARNET);
    await expect(sandCard).toHaveCSS("background-color", "rgb(232, 225, 209)");
    // …and neither tone sets a ring of its own, so these four are app.css's
    // `--focus-ring`, resolved from the nearest ground. Before main's #23 the
    // link on the garnet card measured rgb(101, 35, 35): garnet on garnet, 1:1.
    await expectRing(page, garnetCard.getByLabel("Next slide"), OFF_WHITE);
    await expectRing(page, garnetCard.getByRole("link", { name: "Link in slide 1" }), OFF_WHITE);
    await expectRing(page, sandCard.getByLabel("Next slide"), GARNET);
    await expectRing(page, sandCard.getByRole("link", { name: "Link in slide 1" }), GARNET);
  } finally {
    await context.close();
  }
});

type Rgb = [number, number, number];

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

async function paintedAt(page: Page, x: number, y: number): Promise<Rgb> {
  const png = await page.screenshot({
    clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 },
  });
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

for (const [name, selector, ground, fill] of [
  ["garnet tone on the sand card", AUTO, [232, 225, 209], [61, 7, 7]],
  ["cream tone on the garnet card", MANUAL, [101, 35, 35], [242, 239, 233]],
] as [string, string, Rgb, Rgb][]) {
  test(`the bar as painted — ${name} — is 3:1 at both of its edges`, async ({ page }) => {
    // Reduced motion (the default here) is the still state: fill = 1/3.
    await page.goto(FIXTURES);
    const region = page.locator(selector);
    await adopted(region);
    await region.scrollIntoViewIfNeeded();
    const bar = (await region.locator("[data-carousel-progress]").boundingBox())!;
    const card = (await region.boundingBox())!;

    // The bar's SECOND pixel row: wholly inside it wherever a fractional y snaps.
    const paintedFill = await paintedAt(page, bar.x + bar.width * 0.1, bar.y + 1);
    const paintedTrack = await paintedAt(page, bar.x + bar.width * 0.9, bar.y + 1);
    const paintedGround = await paintedAt(page, card.x + 4, card.y + 4);

    // Guard the sample itself: a miss would compare the ground with itself.
    expect(paintedGround).toEqual(ground);
    expect(paintedFill).toEqual(fill);
    expect(paintedTrack).not.toEqual(ground);
    expect(paintedTrack).not.toEqual(fill);

    const edges = {
      "fill:track": contrast(paintedFill, paintedTrack),
      "track:ground": contrast(paintedTrack, paintedGround),
    };
    for (const [edge, ratio] of Object.entries(edges))
      expect(ratio, `${edge} painted ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
}
