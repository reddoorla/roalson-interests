import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { expectRing, GARNET, OFF_WHITE } from "./expect-ring";
import { hydrated } from "./hydrated";
import { GARNET_RGB, OFF_WHITE_RGB, SAND, type Rgb } from "./palette";

// The "Our Legacy" band makes promises jsdom cannot check (see
// src/lib/slices/Partners/index.svelte):
//
//  1. each card is its Person document — name, PROFILE and all — in the
//     SERVER'S html, and a partner whose Person is unpublished has no card;
//  2. the blocks sit where the comp has them at 1440 and at 390, the cards come
//     first on a phone, and the text stands on the site's right-hand column;
//  3. every text link is a 24px target although its glyphs are 8px tall.
//
// /dev/home is the home route's own markup over fixture data, through the real
// layout; `?photos` gives both Persons a generated headshot and `?unpublished`
// unpublishes the second. `/` answers 404 until the Prismic repo has a
// `home` document and /dev/* 404s on a production build — so NONE of this is
// verified on a production build (#28).
//
// Written to the lessons nav.spec.ts paid for. No x is derived from the window:
// headless Chromium lays this site out 15px narrower than its viewport, and
// `innerWidth` and `clientWidth` both still report the viewport — so where a
// test needs the comp's exact LAYOUT width (the 390 links row is 0.8px from
// wrapping) `layOutAt` widens the viewport until the band itself measures it.
// Everything after a resize auto-retries. The tests that need script wait for
// positive evidence of it.
const LAUNCH = "/dev/home";
const UNPUBLISHED = "/dev/home?unpublished";
const FULL = "/dev/home?photos";

const band = '[data-slice-type="partners"]';

/** Trimmed by the type ramp: the comp measures CAP boxes, CSS line boxes. */
const TRIM = { h2: 11.5, h3: 9.4, h4: 8.1, h5: 3.2 };

/** Script has run: the bar is `absolute` in the server's markup over a dark
 *  first band, and only mount pins it.
 *
 *  15s, not the default 5: every run starts its own COLD vite dev server, and
 *  the first test to need script waits for the whole client graph to be
 *  transformed. With four workers on a loaded machine the first scripted test
 *  took 5.0s, then failed at 5s (13 polls, all `absolute`), then 6.6s — and CI's
 *  two retries hide that where a laptop's zero do not. A longer wait for positive
 *  evidence can only delay a red, never grant a green. */
const adopted = hydrated;

const bandWidth = (page: Page) =>
  page.locator(band).evaluate((el) => el.getBoundingClientRect().width);

/** The webfont has ARRIVED — not "nothing is pending". It is a Google Fonts
 *  stylesheet with `display=swap`, so until it lands every line here is set in
 *  the fallback, and two reads that straddle the swap describe two different
 *  layouts. Measured by holding the font back 2s: the open card reads 363 tall
 *  with a 210 bio before it and 343 with 190 after, and CONTACT is 81.7 wide
 *  and then 77.1. (Found because the no-script test went red once, under a
 *  mutation that could not have touched it; that run's log was not kept, so
 *  the swap is the demonstrated mechanism, not the proven cause.)
 *
 *  A loaded FontFace BY NAME, because `document.fonts.check()` answers true
 *  for a family with no face registered at all. With no Google Fonts on the
 *  network the tests fail HERE, saying so, and not three tests later as "the
 *  headline is three lines". */
const fontsArrived = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fonts.status === "loaded" &&
          [...document.fonts].some(
            (face) =>
              face.family.includes("Atkinson Hyperlegible Next") && face.status === "loaded",
          ),
      ),
    )
    .toBe(true);

/** Lay the page out at exactly `width`, whatever the scrollbar gutter takes. */
async function layOutAt(page: Page, width: number, height = 900) {
  await fontsArrived(page);
  await page.setViewportSize({ width, height });
  let gutter = -1;
  // Retried: the first read after a resize can still be the old layout, and
  // then the "gutter" is hundreds of pixels, or negative.
  await expect
    .poll(async () => {
      gutter = width - (await bandWidth(page));
      return gutter >= 0 && gutter <= 20;
    })
    .toBe(true);
  if (gutter > 0) await page.setViewportSize({ width: width + gutter, height });
  await expect.poll(() => bandWidth(page)).toBe(width);
}

/** Every box relative to the band's own top-left. */
const geometry = (page: Page) =>
  page.evaluate((selector) => {
    const section = document.querySelector(selector)!;
    const origin = section.getBoundingClientRect();
    const box = (el: Element | null | undefined) => {
      if (!el) return null;
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
    const list = section.querySelector("[data-partners-list]")!;
    return {
      width: origin.width,
      height: origin.height,
      ground: getComputedStyle(section).backgroundColor,
      eyebrow: box(section.querySelector("p"))!,
      list: box(list)!,
      rule: box(section.querySelector("[data-partners-rule]"))!,
      headline: box(section.querySelector("h2"))!,
      body: box(section.querySelector("[data-partners-body]"))!,
      cards: [...section.querySelectorAll("[data-partner]")].map((li) => {
        const row = li.firstElementChild!;
        const panel = row.lastElementChild!;
        return {
          card: box(li)!,
          photo: box(li.querySelector("[data-partner-photo]")),
          panel: box(panel)!,
          panelGround: getComputedStyle(panel).backgroundColor,
          name: box(panel.querySelector(".t-h3"))!,
          role: box(panel.querySelector(".t-h4"))!,
          links: box(li.querySelector("[data-partner-links]"))!,
          profile: box(li.querySelector("[data-partner-profile]")),
          contact: box(li.querySelector("[data-partner-contact]"))!,
        };
      }),
    };
  }, band);

const near = (actual: number, expected: number, what: string, tolerance = 0.5) =>
  expect(Math.abs(actual - expected), `${what}: ${actual} vs the comp's ${expected}`).toBeLessThan(
    tolerance,
  );

test("the server's HTML draws each card from its Person, PROFILE and all — and none for an unpublished one", async ({
  page,
}) => {
  const sectionOf = (html: string) =>
    /<section[^>]*data-slice-type="partners"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
  const cardsIn = (html: string) => html.match(/data-partner=""/g)?.length ?? 0;

  const launch = sectionOf(await (await page.request.get(LAUNCH)).text());
  expect(launch, "the band is server-rendered").toContain("Matt Howard");
  expect(launch).toContain("Bart Wilson");
  expect(cardsIn(launch)).toBe(2);
  expect(launch.match(/href="\/team\/matt-howard"/g)?.length, "each card has a profile").toBe(1);
  expect(launch.match(/href="\/team\/bart-wilson"/g)?.length).toBe(1);
  expect(launch).not.toContain("<details");
  // Both partners' CONTACT: neither Person has an email in this state.
  expect(launch.match(/href="\/contact"/g)?.length).toBe(2);

  // #179: the row has no name of its own any more, so an unpublished Person
  // is no card at all — not a card without its PROFILE.
  const unpublished = sectionOf(await (await page.request.get(UNPUBLISHED)).text());
  expect(unpublished).toContain("Matt Howard");
  expect(unpublished).not.toContain("Bart Wilson");
  expect(unpublished).not.toContain("/team/bart-wilson");
  expect(cardsIn(unpublished)).toBe(1);
  expect(unpublished).toMatch(/data-partners-linked="1"[^>]*data-partners-shown="1"/);
});

test("at 1440 the band keeps the comp's rhythm and its text stands on the site's column", async ({
  page,
}) => {
  await page.goto(FULL);
  await layOutAt(page, 1440);
  await expect(page.locator(`${band} > div`)).toHaveCSS("padding-left", "80px");

  const g = await geometry(page);
  expect(g.ground).toBe(OFF_WHITE);
  near(g.height, 556, "band height (6802:1472)");

  // Left column: eyebrow, the rule 40 under its cap top, the first card 70 under.
  const eyebrowTop = g.eyebrow.top + TRIM.h5;
  near(eyebrowTop, 80, "eyebrow cap top");
  near(g.eyebrow.left, 80, "eyebrow left");
  near(g.rule.top - eyebrowTop, 40, "rule under the eyebrow");
  // Its paint and weight are the pixel-row test's, at 1x and 2x.
  near(g.rule.width, 371, "the rule is the column's width");
  near(g.list.top, g.rule.top, "…and takes no room: the list starts where it does");
  near(g.list.width, 371, "left column width (6802:1474)");

  expect(g.cards.length).toBe(2);
  near(g.cards[0].card.top - eyebrowTop, 70, "first card under the eyebrow");
  near(g.cards[1].card.top - g.cards[0].card.bottom, 20, "gap between cards");
  for (const c of g.cards) {
    near(c.card.width, 371, "card width");
    near(c.card.height, 153, "card height");
    near(c.photo!.width, 153, "headshot width");
    near(c.photo!.height, 153, "headshot height");
    near(c.photo!.left, c.card.left, "headshot on the card's left edge");
    near(c.panel.left, c.photo!.right, "panel starts where the headshot ends");
    near(c.panel.width, 218, "panel width (6822:494)");
    expect(c.panelGround).toBe(SAND);
    near(c.name.left - c.panel.left, 15, "panel side padding");
    near(c.name.top + TRIM.h3 - c.card.top, 30, "name cap top");
    near(c.role.top + TRIM.h4 - c.card.top, 66, "role cap top");
    near(c.links.top - c.card.top, 105, "links row top");
  }
  // PROFILE then CONTACT, 20 apart, tops aligned.
  const first = g.cards[0];
  near(first.profile!.left, first.name.left, "PROFILE on the panel's text edge");
  near(first.contact.left - first.profile!.right, 20, "gap between the two links");
  near(first.contact.top, first.profile!.top, "one line");

  // Right column: on the line the footer's headline stands on — the site's ONE
  // grid — measured against that element, not against the window. (It was the
  // hero's H1 until the revised hero went one column, 2026-09-28.)
  const lineLeft = await page
    .locator("footer h2")
    .evaluate((el) => el.getBoundingClientRect().left);
  const bandLeft = await page.locator(band).evaluate((el) => el.getBoundingClientRect().left);
  near(g.headline.left, lineLeft - bandLeft, "headline on the footer headline's column");
  near(g.headline.left, 513, "right column x (ruling C3; the comp draws 514)");
  near(g.headline.top + TRIM.h2, 80, "headline cap top");
  near(g.headline.width, 586, "headline measure");
  near(g.headline.height - 2 * TRIM.h2, 73, "headline is two lines (48 + 25)");
  near(g.body.top - (g.headline.bottom - TRIM.h2), 40, "body under the headline");
  near(g.body.width, 519, "body measure");
  near(g.body.height, 240, "body is ten lines of 24");
});

test("at 390 the cards come first, the links share a line, and they wrap below it", async ({
  page,
}) => {
  await page.goto(FULL);
  await layOutAt(page, 390, 844);
  await expect(page.locator(`${band} > div`)).toHaveCSS("padding-left", "20px");

  const g = await geometry(page);
  near(g.height, 1161, "band height (6994:829)");
  near(g.rule.width, 350, "the rule is the column's width");
  near(g.list.width, 350, "…and so are the cards");
  expect(g.list.bottom, "cards above the headline").toBeLessThan(g.headline.top);
  near(g.headline.top + TRIM.h2 - g.list.bottom, 60, "gap between the two blocks");
  near(g.headline.height - 2 * TRIM.h2, 169, "headline is four lines (3 × 48 + 25)");
  near(g.body.height, 336, "body is fourteen lines");
  for (const c of g.cards) {
    near(c.card.width, 350, "card width");
    near(c.card.height, 153, "card height");
    near(c.panel.width, 197, "panel width (6994:849)");
  }
  // The comp's row is 167.8 wide in a 167 column — one line, as drawn.
  const first = g.cards[0];
  near(first.contact.top, first.profile!.top, "PROFILE and CONTACT share a line at 390");
  expect(first.contact.right, "inside the sand panel").toBeLessThanOrEqual(first.panel.right);

  // Narrower than the comp: the row wraps, and the two 24px targets TILE.
  await layOutAt(page, 360, 844);
  const narrow = (await geometry(page)).cards[0];
  near(narrow.contact.left, narrow.profile!.left, "CONTACT wrapped under PROFILE");
  near(narrow.contact.top - narrow.profile!.top, 24, "wrapped rows are one target apart");
  expect(narrow.profile!.bottom).toBeLessThanOrEqual(narrow.contact.top + 0.01);
  expect(narrow.contact.bottom, "still inside the panel").toBeLessThanOrEqual(narrow.panel.bottom);
});

// #54: the comp draws the card 350 at 390 and 371 at 1440, and nothing
// between. Capped from `lg` only, the column ran the whole width from 640 to
// 1023 — 704 at 768, 959 at 1023 — small text at the left of a wide sand slab.
for (const width of [768, 1000] as const) {
  test(`at ${width} the cards and the rule keep the comp's 371, on the gutter`, async ({
    page,
  }) => {
    await page.goto(FULL);
    await layOutAt(page, width);
    const g = await geometry(page);
    near(g.list.width, 371, "the card column");
    near(g.rule.width, 371, "the rule");
    expect(g.cards.length).toBe(2);
    for (const c of g.cards) {
      near(c.card.width, 371, "card width");
      near(c.card.left, 32, "on the `sm` gutter");
      near(c.photo!.width, 153, "headshot width");
    }
    // Still one column below `lg`: the text is under the cards.
    expect(g.headline.top).toBeGreaterThan(g.list.bottom);
  });
}

/** Device-pixel rows through the rule, 3 above it to 3 below, at one x well
 *  inside it — decoded from a screenshot, which is what the display shows. */
async function ruleRows(page: Page): Promise<Rgb[]> {
  const rule = page.locator(`${band} [data-partners-rule]`);
  await rule.scrollIntoViewIfNeeded();
  const box = (await rule.boundingBox())!;
  const top = Math.floor(box.y) - 3;
  const png = await page.screenshot({
    clip: { x: Math.round(box.x + box.width / 2), y: top, width: 1, height: 7 },
  });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const rows: Rgb[] = [];
  for (let y = 0; y < info.height; y++) {
    const i = y * info.width * info.channels;
    rows.push([data[i], data[i + 1], data[i + 2]]);
  }
  return rows;
}

const close = (a: Rgb, b: Rgb, tolerance = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

// #53, measured by PIXEL ROW, because the layout box says nothing about paint:
// a 1px box scaled to half reads 0.5 tall at every density, and at 1x it
// painted one full device row of solid garnet (101,35,35), a plain 1px line.
// The comp's own 1x render is a half-alpha blend. So: at 1x one device row of
// garnet at 50% over the off-white; at 2x one device row of solid garnet,
// which is 0.5 CSS px. Every other row is the ground.
for (const dpr of [1, 2] as const) {
  test(`at ${dpr}x the rule is one device row of ${dpr === 1 ? "the 50% blend" : "solid garnet"}`, async ({
    browser,
  }) => {
    // Motion ALLOWED, not the harness's `reduce`: under `reduce` the old
    // scaled box painted the 50% blend at 1x too (172,138,137, measured), and
    // this test passed with the fix reverted. With motion allowed — every
    // visitor who has not asked for less — it is the solid row #53 reported.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: dpr,
      reducedMotion: "no-preference",
    });
    try {
      const page = await context.newPage();
      await page.goto(LAUNCH);
      await layOutAt(page, 1440);
      const rows = await ruleRows(page);
      const blend = GARNET_RGB.map((v, i) => Math.round((v + OFF_WHITE_RGB[i]) / 2)) as Rgb;
      const painted = rows.filter((row) => !close(row, OFF_WHITE_RGB, 1));
      expect(
        { rows: rows.length, painted },
        `rows through the rule at ${dpr}x: ${JSON.stringify(rows)}`,
      ).toEqual({ rows: 7 * dpr, painted: [expect.anything()] });
      const [line] = painted;
      expect(
        close(line, dpr === 1 ? blend : GARNET_RGB),
        `the rule's row ${JSON.stringify(line)} against ${JSON.stringify(dpr === 1 ? blend : GARNET_RGB)}`,
      ).toBe(true);
    } finally {
      await context.close();
    }
  });
}

// Found by the fidelity reviewer's width sweep, with every test green: a fixed
// 153px photo square beside a panel that had grown (the name or the links
// wrapping) left a notch of band ground under the photo — 48.9px at 1100 and at
// 360. The comp's own widths never showed it; these are the widths between.
for (const width of [1100, 1024, 360] as const) {
  test(`with headshots the card stays a rectangle at ${width} — the photo is as tall as its row`, async ({
    page,
  }) => {
    await page.goto(FULL);
    await layOutAt(page, width);
    const g = await geometry(page);
    expect(g.cards.length).toBe(2);
    for (const c of g.cards) {
      expect(c.photo, "a photo box").not.toBeNull();
      near(c.photo!.width, 153, "photo width");
      expect(c.photo!.height, "never shorter than the comp's square").toBeGreaterThanOrEqual(152.5);
      near(c.photo!.height, c.panel.height, "photo as tall as the panel beside it");
    }
    // Positive evidence that this width exercises the defect at all: at least
    // one panel has outgrown the 153px square.
    expect(Math.max(...g.cards.map((c) => c.panel.height))).toBeGreaterThan(160);
  });
}

test("with no headshot — the launch state — the panel is the whole card, at the comp's height", async ({
  page,
}) => {
  await page.goto(LAUNCH);
  await layOutAt(page, 1440);
  const g = await geometry(page);
  near(g.height, 556, "band height is unchanged");
  for (const c of g.cards) {
    expect(c.photo, "no photo box").toBeNull();
    near(c.panel.width, c.card.width, "panel spans the card");
    near(c.card.width, 371, "card width");
    near(c.card.height, 153, "card height");
    near(c.links.top - c.card.top, 105, "links row top");
    near(c.profile!.left, c.name.left, "PROFILE on the text edge");
    near(c.contact.top, c.profile!.top, "CONTACT beside it");
  }
});

test("every text link is a 24px target, and the padded zone really takes the pointer", async ({
  page,
}) => {
  await page.goto(FULL);
  await layOutAt(page, 1440);

  const targets = page.locator(`${band} [data-partner-links] > a`);
  await expect(targets).toHaveCount(4);
  for (const target of await targets.all()) {
    await target.scrollIntoViewIfNeeded();
    const hit = await target.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const glyphs = el.querySelector(".t-h5")!.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const owns = (y: number) => el.contains(document.elementFromPoint(x, y));
      return {
        width: b.width,
        height: b.height,
        // 1px inside the top and bottom of the PADDING — far outside the glyphs.
        top: owns(b.top + 1),
        bottom: owns(b.bottom - 1),
        aboveGlyphs: glyphs.top - b.top,
      };
    });
    expect(hit.height, "WCAG 2.5.8").toBeGreaterThanOrEqual(24);
    expect(hit.width).toBeGreaterThanOrEqual(24);
    expect(hit.aboveGlyphs, "the target extends above the glyphs").toBeGreaterThan(4);
    expect(hit.top, "the top of the padded zone is the link's").toBe(true);
    expect(hit.bottom, "the bottom of the padded zone is the link's").toBe(true);
  }
});

test("PROFILE and CONTACT take the garnet ring of the sand panel they sit on", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LAUNCH);
  await adopted(page);
  const card = page.locator(`${band} [data-partner]`).first();
  await expectRing(page, card.locator("[data-partner-profile]"), GARNET);
  await expectRing(page, card.locator("[data-partner-contact]"), GARNET);
});

test("the band passes axe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FULL);
  await adopted(page);

  const audit = async () => {
    const results = await new AxeBuilder({ page })
      .include(band)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    // A rule that threw is not a pass, and an empty `violations` must not mean
    // "never looked" (tests/a11y/fixtures.spec.ts insists on both).
    const crashed = results.incomplete.flatMap((rule) =>
      rule.nodes.flatMap((node) =>
        [...node.any, ...node.all, ...node.none].filter((check) => check.id === "error-occurred"),
      ),
    );
    expect(crashed).toEqual([]);
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // "Needs review" is not a pass either, and the gate does not fail on it.
    // This band's hairline was first a `before:` on the list, and axe will not
    // measure text under an ancestor whose pseudo-element is a quarter of the
    // text's own area — so PROFILE and both CONTACTs, the smallest type on the
    // page, were the three nodes nobody had measured.
    const unmeasured = results.incomplete
      .filter((rule) => rule.id === "color-contrast")
      .flatMap((rule) => rule.nodes.map((node) => node.html.slice(0, 80)));
    expect(unmeasured, "text whose contrast axe could not measure").toEqual([]);
    const measured = results.passes.find((rule) => rule.id === "color-contrast")?.nodes ?? [];
    return measured.map((node) => node.html);
  };

  // Eyebrow, 2 names, 2 roles, 2 PROFILEs, 2 CONTACTs, headline, 2 body
  // paragraphs. The links are counted by name — they are the ones that went
  // missing.
  const measured = await audit();
  expect(measured.length, "every text node in the band").toBe(12);
  expect(measured.filter((html) => /<span class="t-h5/.test(html)).length, "the four links").toBe(
    4,
  );
});
