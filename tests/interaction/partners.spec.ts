import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectRing, GARNET, OFF_WHITE } from "./expect-ring";

// The "Our Legacy" band makes promises jsdom cannot check (see
// src/lib/slices/Partners/index.svelte):
//
//  1. PROFILE opens a partner's bio WITH NO SCRIPT — it is a native <details>,
//     and the bio, which lives outside it, is closed by one `:has()` rule;
//  2. the bio is in the SERVER'S html, and PROFILE is not there at all for a
//     partner without one;
//  3. the blocks sit where the comp has them at 1440 and at 390, the cards come
//     first on a phone, and the text stands on the site's right-hand column;
//  4. every text link is a 24px target although its glyphs are 8px tall.
//
// /dev/home is the home route's own markup over fixture data, through the real
// layout; `?bio` gives the FIRST partner a bio and `?photos` gives both a
// generated headshot. `/` answers 404 until the Prismic repo has a `home`
// document and /dev/* 404s on a production build — so NONE of this is verified
// on a production build (#28).
//
// Written to the lessons nav.spec.ts paid for. No x is derived from the window:
// headless Chromium lays this site out 15px narrower than its viewport, and
// `innerWidth` and `clientWidth` both still report the viewport — so where a
// test needs the comp's exact LAYOUT width (the 390 links row is 0.8px from
// wrapping) `layOutAt` widens the viewport until the band itself measures it.
// Everything after a resize auto-retries. The one test that needs script waits
// for positive evidence of it; the no-script test demands positive evidence of
// its ABSENCE. The shared config forces `reducedMotion: "reduce"`, under which
// app.css makes the arrow's turn instant — harmless, the end state is what is
// read (and "instant" is itself measured below, in both preferences).
const LAUNCH = "/dev/home";
const BIO = "/dev/home?bio";
const FULL = "/dev/home?bio&photos";

const SAND = "rgb(232, 225, 209)";

const bar = 'nav[aria-label="Primary"]';
const band = '[data-slice-type="partners"]';
const BIO_TEXT = "Fixture copy, not a biography.";

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
const adopted = (page: Page) =>
  expect(page.locator(bar)).toHaveCSS("position", "fixed", { timeout: 15_000 });

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
      rulePaint: getComputedStyle(section.querySelector("[data-partners-rule]")!).backgroundColor,
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
          profile: box(li.querySelector("summary")),
          contact: box(li.querySelector("[data-partner-links] > a"))!,
        };
      }),
    };
  }, band);

const near = (actual: number, expected: number, what: string, tolerance = 0.5) =>
  expect(Math.abs(actual - expected), `${what}: ${actual} vs the comp's ${expected}`).toBeLessThan(
    tolerance,
  );

test("the server's HTML holds the bio behind a closed <details> — and no PROFILE without one", async ({
  page,
}) => {
  const sectionOf = (html: string) =>
    /<section[^>]*data-slice-type="partners"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";

  const withBio = sectionOf(await (await page.request.get(BIO)).text());
  expect(withBio, "the band is server-rendered").toContain("Matt Howard");
  expect(withBio).toContain(BIO_TEXT);
  expect(withBio.match(/<details/g)?.length, "one card has a bio").toBe(1);
  expect(withBio).toMatch(/<summary[^>]*aria-controls=/);
  expect(withBio, "closed in the markup").not.toMatch(/<details[^>]*\bopen\b/);
  // The bio is OUTSIDE the <details>: it closes before the bio opens.
  expect(withBio.indexOf("</details>")).toBeLessThan(withBio.indexOf("data-partner-bio"));
  // Both partners' CONTACT, the second card's with no PROFILE beside it.
  expect(withBio.match(/href="\/contact"/g)?.length).toBe(2);

  const launch = sectionOf(await (await page.request.get(LAUNCH)).text());
  expect(launch).toContain("Bart Wilson");
  expect(launch).not.toContain("<details");
  expect(launch).not.toContain("<summary");
  expect(launch).not.toContain("data-partner-bio");
  expect(launch.toLowerCase()).not.toContain("profile");
  expect(launch.match(/href="\/contact"/g)?.length).toBe(2);
});

test("with scripting OFF, PROFILE opens the bio and closes it again", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BIO, { waitUntil: "domcontentloaded" });

    // Positive evidence that script is really off, or "works without script"
    // is a claim about nothing. The bar being `absolute` is NOT that evidence
    // on its own — a script-on page shows the same thing until mount — so this
    // reads what only a script-off document produces: app.html's <noscript>
    // stylesheet hiding `[data-js-only]` (measured: "none" off, "flex" on).
    await expect(page.locator(bar)).toHaveCSS("position", "absolute");
    await expect(page.locator("[data-js-only]").first()).toHaveCSS("display", "none");
    // `evaluate` still runs with page script off; the stylesheet's font does too.
    await fontsArrived(page);

    const card = page.locator(`${band} [data-partner]`).first();
    const profile = card.locator("summary");
    const bio = card.locator("[data-partner-bio]");
    await expect(profile).toBeVisible();
    await expect(bio, "closed until asked for").toBeHidden();
    // Card and bio in ONE read: two round trips can straddle a relayout.
    const sizes = () =>
      card.evaluate((li) => {
        const region = li.querySelector("[data-partner-bio]")!.getBoundingClientRect();
        const box = li.getBoundingClientRect();
        return { card: box.height, width: box.width, bio: region.height, bioWidth: region.width };
      });
    expect(await sizes()).toMatchObject({ card: 153, bio: 0 });

    await profile.click();
    await expect(bio).toBeVisible();
    await expect(bio).toContainText(BIO_TEXT);
    await expect(card.locator("details")).toHaveAttribute("open", "");
    const open = await sizes();
    expect(open.bio, "two paragraphs of Body 2").toBeGreaterThan(100);
    expect(open.card, "the card grew by exactly the bio").toBeCloseTo(153 + open.bio, 1);
    expect(open.bioWidth, "at the card's full width, not the panel's").toBeCloseTo(open.width, 1);
    await expect(bio).toHaveCSS("background-color", SAND);

    await profile.click();
    await expect(bio).toBeHidden();

    // The partner without a bio has CONTACT and nothing to open.
    const second = page.locator(`${band} [data-partner]`).nth(1);
    await expect(second.locator("summary")).toHaveCount(0);
    await expect(second.getByRole("link", { name: "Contact Bart Wilson" })).toHaveAttribute(
      "href",
      "/contact",
    );
  } finally {
    await context.close();
  }
});

test("from the keyboard, Enter on PROFILE opens the bio and turns the arrow down", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BIO);
  await adopted(page);

  const card = page.locator(`${band} [data-partner]`).first();
  const profile = card.locator("summary");
  await expect(profile).toHaveText("Profile, Matt Howard");
  const bio = card.locator("[data-partner-bio]");
  const arrow = profile.locator("svg");
  await expect(bio).toBeHidden();
  await expect(arrow).toHaveCSS("rotate", "none");

  await profile.focus();
  await page.keyboard.press("Enter");
  await expect(bio).toBeVisible();
  await expect(arrow).toHaveCSS("rotate", "90deg");
  // It names what it controls, and that element is the one that opened.
  const controls = await profile.getAttribute("aria-controls");
  expect(controls).toBe(await bio.getAttribute("id"));

  await page.keyboard.press("Enter");
  await expect(bio).toBeHidden();
  await expect(arrow).toHaveCSS("rotate", "none");
});

test("the arrow's turn is animated only for a visitor who has not asked for less motion", async ({
  page,
  browser,
}) => {
  // The slice gates nothing itself: `transition-transform duration-200` is
  // bare, and what stills it is app.css's base-layer rule that sets every
  // transition to 0.01ms under `reduce`. That is a claim about two files, so
  // it is measured — in BOTH preferences, each with positive evidence of which
  // one the context holds. A test that only ever saw the config's forced
  // `reduce` would pass on a slice with no transition at all; one that only
  // saw `no-preference` would pass with app.css's rule deleted.
  const reads = (p: Page) =>
    p.locator(`${band} summary svg`).evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
        turns: cs.transitionProperty.split(", ").includes("rotate"),
        duration: cs.transitionDuration,
      };
    });

  await page.goto(BIO);
  // 0.01ms, as Chromium serialises it.
  expect(await reads(page)).toEqual({ reduce: true, turns: true, duration: "1e-05s" });

  const context = await browser.newContext({ reducedMotion: "no-preference" });
  try {
    const moving = await context.newPage();
    await moving.goto(BIO);
    expect(await reads(moving)).toEqual({ reduce: false, turns: true, duration: "0.2s" });
  } finally {
    await context.close();
  }
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
  expect(g.rulePaint, "the rule is garnet").toBe(GARNET);
  near(g.rule.height, 0.5, "a half-pixel stroke, not a border snapped up to 1", 0.01);
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

  // Right column: on the line the hero's headline stands on — the site's ONE
  // grid — measured against that element, not against the window.
  const heroLeft = await page
    .locator('[data-slice-type="home_hero"] h1')
    .evaluate((el) => el.getBoundingClientRect().left);
  const bandLeft = await page.locator(band).evaluate((el) => el.getBoundingClientRect().left);
  near(g.headline.left, heroLeft - bandLeft, "headline on the hero headline's column");
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

// Found by the fidelity reviewer's width sweep, with every test green: a fixed
// 153px photo square beside a panel that had grown (the name or the links
// wrapping) left a notch of band ground under the photo — 48.9px at 1100 and at
// 360. The comp's own widths never showed it; these are the widths between.
for (const width of [1100, 1024, 360] as const) {
  test(`with headshots the card stays a rectangle at ${width} — the photo is as tall as its row`, async ({
    page,
  }) => {
    await page.goto("/dev/home?bio&photos");
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
    expect(c.profile, "no PROFILE").toBeNull();
    near(c.panel.width, c.card.width, "panel spans the card");
    near(c.card.width, 371, "card width");
    near(c.card.height, 153, "card height");
    near(c.links.top - c.card.top, 105, "links row top");
    near(c.contact.left, c.name.left, "CONTACT on the text edge");
  }
});

test("every text link is a 24px target, and the padded zone really takes the pointer", async ({
  page,
}) => {
  await page.goto(FULL);
  await layOutAt(page, 1440);

  const targets = page.locator(`${band} [data-partner-links] > a, ${band} summary`);
  await expect(targets).toHaveCount(3);
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
  await page.goto(BIO);
  await adopted(page);
  const card = page.locator(`${band} [data-partner]`).first();
  await expectRing(page, card.locator("summary"), GARNET);
  await expectRing(page, card.locator("[data-partner-links] > a"), GARNET);
});

test("the band passes axe, closed and with a bio open", async ({ page }) => {
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

  // Closed: eyebrow, 2 names, 2 roles, PROFILE, 2 CONTACTs, headline, 2 body
  // paragraphs. The links are counted by name — they are the ones that went
  // missing.
  const closed = await audit();
  expect(closed.length, "every text node in the band").toBe(11);
  expect(closed.filter((html) => /<span class="t-h5/.test(html)).length, "the three links").toBe(3);

  await page.locator(`${band} summary`).click();
  await expect(page.locator(`${band} [data-partner-bio]`)).toBeVisible();
  const open = await audit();
  expect(open.length, "…and the bio's two paragraphs once it is open").toBe(13);
});
