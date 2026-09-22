import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { HYDRATION_TIMEOUT } from "./hydrated";

// The footer makes promises jsdom cannot check (see Footer.svelte): where its
// blocks sit against the comp, that the order flips on a phone, what ground it
// stands on, and the height it publishes for the homepage's pinned photo band.
//
// Every route renders it (it is layout chrome). LISTING is the listing fixture
// — it opens on PageMasthead, whose H1 sits on the site's right-hand column, so
// the footer's headline has something to be measured AGAINST. FADE is the one
// fixture that claims the homepage's graded ground. LIGHT opens on no dark
// band, so its bar is pinned in the server's markup.
//
// House rules, paid for in nav.spec.ts: no x derived from the window (the CI
// runner lays out 15px narrower than it reports) — every position here is
// relative to the footer or to another element; sizes after setViewportSize
// are auto-retrying; and nothing is read before script has provably run.
const LISTING = "/dev/properties";
const FADE = "/dev/footer";
const LIGHT = "/dev/property";

const SAND = "rgb(232, 225, 209)";
const OFF_WHITE = "rgb(242, 239, 233)";

/** Half the leading the ramp trims off `t-h1` (80 line, 44 cap box). The comp
 *  measures from the CAP box, CSS from the line box. */
const H1_TRIM = 18;

const footerH = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue("--footer-h"));

/** Positive evidence of hydration: only the footer's own effect writes this. */
// The footer's own evidence: `--footer-h`, written by its ResizeObserver.
// The timeout is the shared one — a cold dev server's first transform, not
// this site's speed (see ./hydrated).
const hydrated = (page: Page) =>
  expect.poll(() => footerH(page), { timeout: HYDRATION_TIMEOUT }).toMatch(/^\d+(\.\d+)?px$/);

/** Boxes relative to the footer's own top-left. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const footer = document.querySelector("footer")!;
    const origin = footer.getBoundingClientRect();
    const box = (el: Element | null | undefined) => {
      if (!el) throw new Error("missing element");
      const b = el.getBoundingClientRect();
      return {
        left: b.left - origin.left,
        top: b.top - origin.top,
        right: b.right - origin.left,
        bottom: b.bottom - origin.top,
        width: b.width,
        height: b.height,
      };
    };
    const inner = footer.firstElementChild!;
    const legal = [...footer.querySelectorAll('a[target="_blank"]')].map((a) =>
      box(a.closest("li")),
    );
    return {
      height: origin.height,
      contentLeft: box(inner).left + parseFloat(getComputedStyle(inner).paddingLeft),
      headline: box(footer.querySelector("h2")),
      buttons: [...footer.querySelectorAll("h2 + div a")].map(box),
      wordmark: box(footer.querySelector('a[href="/"] img')),
      nav: box(footer.querySelector("#footer-nav")),
      rows: [...footer.querySelectorAll("#footer-nav li")].map(box),
      address: box(footer.querySelector("address")),
      phone: box(footer.querySelector('a[href^="tel:"]')),
      legal,
      rights: box([...footer.querySelectorAll("p")].find((p) => p.textContent?.includes("©"))),
    };
  });

test("at 1440 the headline stands on the listing column's line and the blocks keep the comp's rhythm", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LISTING);
  await hydrated(page);
  await expect(page.locator("footer > div")).toHaveCSS("padding-left", "80px");

  const g = await geometry(page);
  const near = (actual: number, expected: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThan(0.75);

  // One vertical line through the site: the masthead's H1, the cards, the
  // menu's links — and this. Read off the masthead, not computed from 1440.
  const mastheadX = await page
    .locator("main header h1")
    .evaluate(
      (h1) =>
        h1.getBoundingClientRect().left -
        document.querySelector("footer")!.getBoundingClientRect().left,
    );
  near(g.headline.left, mastheadX, "headline x against the masthead H1's");
  near(g.wordmark.left, g.contentLeft, "wordmark on the gutter");
  expect(g.wordmark.width).toBe(145);

  // 60 of padding, both blocks top-aligned on it (the headline by its cap box).
  near(g.wordmark.top, 60, "top padding");
  near(g.headline.top + H1_TRIM, g.wordmark.top, "headline cap top level with the wordmark");
  near(g.headline.height, 160, "two lines of 80");
  near(
    g.buttons[0].top - (g.headline.bottom - H1_TRIM),
    40,
    "buttons under the headline's cap box",
  );
  near(g.buttons[1].left - g.buttons[0].right, 20, "between the buttons");
  expect(g.buttons.map((b) => b.height)).toEqual([40, 40]);

  // The left block: 80 under the wordmark, rows 18 tall on a 38 pitch, then
  // 20 / 10 / 10 / 10 down through the office and the two TREC links.
  near(g.rows[0].top - g.wordmark.bottom, 80, "wordmark to the list");
  expect(g.rows.map((r) => r.height)).toEqual(g.rows.map(() => 18));
  g.rows.slice(1).forEach((row, i) => near(row.top - g.rows[i].top, 38, `row ${i + 1} pitch`));
  near(g.address.top - g.nav.bottom, 20, "list to address");
  near(g.address.height, 60, "three address lines of 20");
  near(g.phone.top - g.address.bottom, 10, "address to phone");
  near(g.legal[0].top - g.phone.bottom, 10, "phone to the first TREC link");
  near(g.legal[1].top - g.legal[0].bottom, 10, "between the TREC links");
  expect(g.legal.map((l) => l.height)).toEqual([40, 40]);
  expect(g.legal.every((l) => l.width <= 298)).toBe(true);

  // The rights line costs the band no height: it stands in the headline's
  // column, level with the last TREC line, and 60 of padding closes the band.
  near(g.rights.left, g.headline.left, "rights line in the right column");
  near(g.rights.bottom, g.legal[1].bottom, "rights line level with the last TREC line");
  near(g.height - g.legal[1].bottom, 60, "bottom padding");
});

test("at 390 the order flips — headline, 100px, then the wordmark block", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LISTING);
  await hydrated(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("footer > div")).toHaveCSS("padding-left", "20px");
  // Still H1 at this width, as drawn: four lines of 80.
  await expect(page.locator("footer h2")).toHaveCSS("font-size", "66px");
  await expect.poll(async () => (await geometry(page)).headline.height).toBe(320);

  const g = await geometry(page);
  expect(g.headline.top + H1_TRIM).toBeCloseTo(60, 0);
  expect(g.headline.bottom, "headline above the wordmark").toBeLessThan(g.wordmark.top);
  expect(g.buttons[0].top, "both buttons on one row").toBe(g.buttons[1].top);
  expect(g.wordmark.top - g.buttons[0].bottom).toBeCloseTo(100, 0);
  expect(g.wordmark.left).toBeCloseTo(g.contentLeft, 0);
  expect(g.rows[0].top - g.wordmark.bottom).toBeCloseTo(80, 0);
  // Below the wordmark block here, not beside it.
  expect(g.rights.top - g.legal[1].bottom).toBeCloseTo(40, 0);
  expect(g.rights.left).toBeCloseTo(g.contentLeft, 0);
});

test("at 320 the headline steps down to H2 instead of losing a letter to the body's clip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(LISTING);
  await hydrated(page);
  const headline = page.locator("footer h2");
  await expect(headline).toHaveCSS("font-size", "38px");
  await expect(headline).toHaveCSS("line-height", "48px");

  // The TEXT's own rects, line by line — the h2's box is as wide as its column
  // whether or not the words inside it fit.
  const fit = await headline.evaluate((h2) => {
    const range = document.createRange();
    range.selectNodeContents(h2);
    const lines = [...range.getClientRects()].filter((r) => r.width > 0);
    return {
      edge: h2.getBoundingClientRect().right,
      widest: Math.max(...lines.map((r) => r.right)),
      lines: lines.length,
    };
  });
  expect(fit.lines, "measured real lines of text").toBeGreaterThanOrEqual(2);
  expect(fit.widest, JSON.stringify(fit)).toBeLessThanOrEqual(fit.edge + 0.5);
});

test("the ground is flat sand, and the homepage's grade only from lg", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const footer = page.locator("footer");

  await page.goto(LISTING);
  await hydrated(page);
  await expect(footer).toHaveCSS("background-color", SAND);
  await expect(footer).toHaveCSS("background-image", "none");

  await page.goto(FADE);
  await hydrated(page);
  // Off-white at the top edge, sand at the foot — in that order, top to bottom.
  const image = await footer.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(image).toMatch(/^linear-gradient\(/);
  expect(image).not.toMatch(/to (top|left|right)|\ddeg/);
  expect(image.indexOf(OFF_WHITE), image).toBeGreaterThan(-1);
  expect(image.indexOf(SAND), image).toBeGreaterThan(image.indexOf(OFF_WHITE));

  // The comp's 390 homepage is flat: the same route, narrow, has no gradient.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(footer).toHaveCSS("background-image", "none");
  await expect(footer).toHaveCSS("background-color", SAND);
});

test("--footer-h is the footer's own height, follows a resize, and paints above what it crosses", async ({
  page,
}) => {
  const measured = () =>
    page.evaluate(() => {
      const height = document.querySelector("footer")!.getBoundingClientRect().height;
      return `${Math.round(height * 100) / 100}px`;
    });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LISTING);
  await hydrated(page);
  const wide = await footerH(page);
  expect(wide).toBe(await measured());
  expect(parseFloat(wide), "a real height, not jsdom's 0").toBeGreaterThan(400);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => footerH(page)).not.toBe(wide);
  await expect.poll(async () => (await footerH(page)) === (await measured())).toBe(true);
  expect(parseFloat(await footerH(page))).toBeGreaterThan(parseFloat(wide));

  await expect(page.locator("footer")).toHaveCSS("position", "relative");
  await expect(page.locator("footer")).toHaveCSS("z-index", "10");
});

test("with scripting off the footer is whole, and --footer-h is simply unset", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIGHT, { waitUntil: "domcontentloaded" });
    const footer = page.locator("footer");
    await expect(footer.locator("#footer-nav a")).toHaveText(["Our portfolio", "Contact us"]);
    await expect(footer.locator("address")).toContainText("San Antonio, TX 78258");
    await expect(footer.getByRole("heading", { level: 2 })).toBeVisible();
    // A reader of the property must fall back to 0 — nothing ever wrote it.
    // Read from where Footer.svelte WRITES it, not grepped out of the page: the
    // dev server inlines app.css into the document, and since the photo band
    // that stylesheet reads the property by name (`var(--footer-h, 0px)`), so
    // the string is in every page whether or not anything set it.
    const written = await page.evaluate(() => ({
      inline: document.documentElement.getAttribute("style") ?? "",
      computed: getComputedStyle(document.documentElement).getPropertyValue("--footer-h"),
    }));
    expect(written.inline).not.toContain("--footer-h");
    expect(written.computed).toBe("");
  } finally {
    await context.close();
  }
});

test("#footer-nav is a jump target that lands clear of the pinned bar — script or no script", async ({
  browser,
}) => {
  // A short viewport, so the page can scroll far enough for the margin to be
  // what decides where the list lands (the footer is ~513 tall).
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({
      javaScriptEnabled,
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 400 },
    });
    try {
      const page = await context.newPage();
      await page.goto(`${LIGHT}#footer-nav`, {
        waitUntil: javaScriptEnabled ? "load" : "domcontentloaded",
      });
      if (javaScriptEnabled) await hydrated(page);
      // NOT a hydration wait, though it is spelled like one: this page's ground
      // is light, so the server ships the bar already pinned and this is true
      // with script off too. It is the claim the landing below is measured
      // against.
      const bar = page.locator('nav[aria-label="Primary"]');
      await expect(bar).toHaveCSS("position", "fixed");
      const read = () =>
        page.evaluate(() => ({
          list: document.querySelector("#footer-nav")!.getBoundingClientRect().top,
          bar: document.querySelector('nav[aria-label="Primary"]')!.getBoundingClientRect().bottom,
        }));
      const label = `javaScriptEnabled=${javaScriptEnabled}`;
      await expect.poll(async () => (await read()).list, label).toBeLessThan(400);
      await expect
        .poll(async () => {
          const at = await read();
          return at.list - at.bar;
        }, label)
        .toBeGreaterThanOrEqual(0);
    } finally {
      await context.close();
    }
  }
});

test("the footer has no axe violations, and its contrast was actually measured", async ({
  page,
}) => {
  await page.goto(LISTING);
  await hydrated(page);
  const results = await new AxeBuilder({ page })
    .include("footer")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  // The two halves tests/a11y/fixtures.spec.ts insists on: a rule that threw
  // is not a pass, and an empty `violations` must not mean "never looked".
  const crashed = results.incomplete.flatMap((rule) =>
    rule.nodes.flatMap((node) =>
      [...node.any, ...node.all, ...node.none].filter((check) => check.id === "error-occurred"),
    ),
  );
  expect(crashed).toEqual([]);
  const contrast = results.passes.find((rule) => rule.id === "color-contrast");
  expect(contrast?.nodes.length ?? 0, "color-contrast measured no footer text").toBeGreaterThan(5);
  expect(results.violations).toEqual([]);
});
