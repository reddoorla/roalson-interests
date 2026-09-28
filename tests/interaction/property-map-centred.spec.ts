import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";
import { placedPin, steadyMarkers } from "./placed-markers";

// THE STICKY MAP PINS IN THE MIDDLE OF THE WINDOW (operator, 2026-09-23: "on
// properties, stick the map in the center of the screen rather than floating
// to the top").
//
// PropertyListing gives the map `top: max(var(--sticky-top), 50vh - half the
// map)`. The unit test can only read that class string; what it DOES is only
// visible here. Four claims:
//
//  1. CENTRED. Mid-way through each active section, the pinned map's vertical
//     centre is the window's centre, within 1px, at 1440x900 and 1920x1080.
//     The line is the WINDOW's middle because that is the line the garnet card
//     and the camera follow (`centreWatch`).
//  2. CLAMPED. On a window too short for that (1440x720: half the window less
//     half the map is 62.5), the map sits on `--sticky-top` instead, which is
//     the declared usable top in the first section and the pinned divider's
//     bottom in every later one. Never under the bar, never under a divider.
//  3. CSS, NOT SCRIPT. Both hold with scripting off.
//  4. A PIN PRESS STILL LANDS. Pressing a pin scrolls its card onto the
//     centre line, it goes garnet, the camera puts its pin at the map's middle,
//     and the card is level with the map's own centre.
//
// ON /properties, not the fixture, so it runs on a production build:
//
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/property-map-centred.spec.ts
//
// Nothing hard-codes a listing: the ids are Prismic's, discovered from the DOM.
// What it may assume is the shape the page promises — active sections, each
// with a map beside a column of cards taller than it.

const LIVE = "/properties";
const MAP = "[data-property-map]";

/** Brand garnet as a COMPUTED colour (app.css `--color-primary`). */
const GARNET = "rgb(101, 35, 35)";

/** A scroll that turns a card garnet can take seconds on a loaded machine;
 *  see active-card-highlight.spec.ts's MOVE_TIMEOUT. A green run pays nothing. */
const MOVE_TIMEOUT = 15_000;

/** The brief's tolerance: the map's centre on the window's centre within 1px. */
const PX = 1;

/** A context under the fleet's own `reducedMotion: "reduce"`, so every scroll
 *  here is instant. What is measured is where things pin, not how they move. */
async function at(browser: Browser, width: number, height: number, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled });
  return { context, page: await context.newPage() };
}

/** Every section on the page that draws a map, by its heading id. */
const mapSections = (page: Page) =>
  page.$$eval("section[aria-labelledby^='listing-']", (secs) =>
    secs
      .filter((s) => s.querySelector("[data-property-map]"))
      .map((s) => s.getAttribute("aria-labelledby")!),
  );

const sectionOf = (page: Page, labelledBy: string) =>
  page.locator(`section[aria-labelledby="${labelledBy}"]`);

/**
 * Scroll so the middle of this section's GRID AREA (the map's sticky
 * containing block) is at the middle of the window and read everything; then
 * scroll 100px further and read it all again. Returns both reads.
 *
 * WHY THAT SCROLL. It is derived from the page's geometry and not from the
 * map's `top`, so the test does not agree with the expression it is testing:
 * any area taller than the map by a margin puts its map mid-travel here,
 * pinned, whatever the offset is.
 *
 * ONE SYNCHRONOUS PASS. An instant `scrollTo` is applied at once and
 * `getBoundingClientRect()` forces the layout that places a sticky box, so
 * each read describes the scroll it follows with nothing in between. The first
 * version spread this over four calls with a 150ms wait, recomputing the
 * second scroll's target from the page, and once — scripting off, 1440x720,
 * during the mutation pass — it read a 100px nudge as 90. The cause was not
 * isolated: the page's geometry is steady from `load` on (four no-JS loads,
 * six samples each out to 2.5s, identical). So rather than guess which gap
 * it fell into, there are no gaps.
 *
 * `$eval`, not `evaluate` with a promise: it runs through Playwright's own
 * binding, so the same read works with the page's scripts off (claim 3), where
 * a rAF-based wait never settles.
 */
const pinnedMidSection = (page: Page, labelledBy: string) =>
  page.$eval(`section[aria-labelledby="${labelledBy}"]`, (sec) => {
    const map = sec.querySelector("[data-property-map]") as HTMLElement;
    const grid = map.parentElement!;
    const divider = sec.firstElementChild as HTMLElement;
    const area = () => {
      const gs = getComputedStyle(grid);
      const g = grid.getBoundingClientRect();
      return {
        top: g.top + parseFloat(gs.paddingTop),
        bottom: g.bottom - parseFloat(gs.paddingBottom),
      };
    };
    const read = () => {
      const m = map.getBoundingClientRect();
      const d = divider.getBoundingClientRect();
      // `--sticky-top` RESOLVED to px. Its computed value is a token stream —
      // with scripting off it reads back as the unevaluated `calc(100px + 2px
      // + …)` app.css declares — so it is measured as a length on a probe
      // rather than parsed.
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;top:0;height:var(--sticky-top)";
      grid.append(probe);
      const stickyTop = probe.getBoundingClientRect().height;
      probe.remove();
      return {
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        position: getComputedStyle(map).position,
        map: { top: m.top, bottom: m.bottom, height: m.height, centre: (m.top + m.bottom) / 2 },
        area: area(),
        divider: {
          sticky: getComputedStyle(divider).position === "sticky",
          top: d.top,
          bottom: d.bottom,
        },
        usableTop: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
        stickyTop,
      };
    };
    const here = area();
    const mid = (here.top + here.bottom) / 2 + window.scrollY - window.innerHeight / 2;
    window.scrollTo({ top: mid, behavior: "instant" });
    const a = read();
    window.scrollTo({ top: window.scrollY + 100, behavior: "instant" });
    const b = read();
    return { a, b };
  });

type Pinned = Awaited<ReturnType<typeof pinnedMidSection>>["a"];

/** The preconditions every geometry case needs before its assertion means
 *  anything: the map is the comp's panel, sticky, and really PINNED — its area
 *  has scrolled past it at both ends, and a further 100px scroll moved the
 *  page's content and left the map where it was. */
function expectPinned(name: string, { a, b }: { a: Pinned; b: Pinned }) {
  expect(a.position, `${name}: the map is sticky at this width`).toBe("sticky");
  expect(a.map.height, `${name}: the comp's 595 panel`).toBeCloseTo(595, 0);
  expect(a.area.top, `${name}: its area's top has scrolled above it`).toBeLessThan(a.map.top - 20);
  expect(a.area.bottom, `${name}: its area's foot is still below it`).toBeGreaterThan(
    a.map.bottom + 20,
  );
  expect(b.scrollY - a.scrollY, `${name}: the second read really scrolled`).toBeCloseTo(100, 0);
  expect(a.area.top - b.area.top, `${name}: and the content went with it`).toBeCloseTo(100, 0);
  expect(Math.abs(b.map.top - a.map.top), `${name}: but the map did not`).toBeLessThan(0.5);
}

async function sections(page: Page) {
  const ids = await mapSections(page);
  expect(ids.length, "the live portfolio has active sections with maps").toBeGreaterThan(0);
  // Every one of them must give its map room to pin, or "mid-section" is not
  // a pinned state at all and every assertion below is about a resting map.
  for (const id of ids) {
    const room = await sectionOf(page, id)
      .locator(MAP)
      .evaluate((map) => {
        const grid = map.parentElement!;
        const gs = getComputedStyle(grid);
        const g = grid.getBoundingClientRect();
        return (
          g.height -
          parseFloat(gs.paddingTop) -
          parseFloat(gs.paddingBottom) -
          map.getBoundingClientRect().height
        );
      });
    expect(room, `${id}: its cards give the map room to pin`).toBeGreaterThan(400);
  }
  return ids;
}

// ── 1 and 2: centred where the window allows it, floored where it does not ──

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`${width}x${height}: the pinned map's centre is the window's centre`, async ({
    browser,
  }) => {
    const { context, page } = await at(browser, width, height);
    try {
      await page.goto(LIVE);
      await hydrated(page);
      for (const id of await sections(page)) {
        const read = await pinnedMidSection(page, id);
        expectPinned(id, read);
        const { a } = read;
        // THE CLAIM. Not "below the divider" or "lower than it was": the one
        // line the camera and the garnet card follow.
        expect(
          Math.abs(a.map.centre - a.innerHeight / 2),
          `${id}: map centre ${a.map.centre} against the window's ${a.innerHeight / 2}`,
        ).toBeLessThanOrEqual(PX);
        // And that is ABOVE its floor here, or this case would be the clamp's.
        expect(a.map.top, `${id}: centring clears the floor at this height`).toBeGreaterThan(
          a.stickyTop + PX,
        );
        if (a.divider.sticky)
          expect(a.map.top, `${id}: clear of its pinned divider`).toBeGreaterThanOrEqual(
            a.divider.bottom - 0.5,
          );
      }
    } finally {
      await context.close();
    }
  });
}

test("1440x720: too short to centre, so the map sits on --sticky-top", async ({ browser }) => {
  const { context, page } = await at(browser, 1440, 720);
  try {
    await page.goto(LIVE);
    await hydrated(page);
    for (const id of await sections(page)) {
      const read = await pinnedMidSection(page, id);
      expectPinned(id, read);
      const { a } = read;
      // NOT VACUOUS: centring would have put the map ABOVE its floor here.
      expect(
        a.innerHeight / 2 - a.map.height / 2,
        `${id}: half the window less half the map is above the floor`,
      ).toBeLessThan(a.stickyTop - 20);
      // THE CLAIM: it sits on the floor…
      expect(
        Math.abs(a.map.top - a.stickyTop),
        `${id}: map top ${a.map.top} against --sticky-top ${a.stickyTop}`,
      ).toBeLessThanOrEqual(PX);
      // …and the floor is what it says it is: the declared usable top where
      // nothing pins, the pinned divider's bottom where one does.
      if (a.divider.sticky) {
        expect(a.divider.top, `${id}: its divider is pinned at this scroll`).toBeCloseTo(0, 0);
        expect(
          Math.abs(a.map.top - a.divider.bottom),
          `${id}: map top ${a.map.top} against the divider's bottom ${a.divider.bottom}`,
        ).toBeLessThanOrEqual(PX);
      } else {
        expect(Math.abs(a.map.top - a.usableTop), `${id}: on the usable top`).toBeLessThanOrEqual(
          PX,
        );
      }
    }
  } finally {
    await context.close();
  }
});

// ── 3: all of that is CSS ───────────────────────────────────────────────────

test("with scripting off: centred at 1440x900 and floored at 1440x720, from the server's CSS alone", async ({
  browser,
}) => {
  for (const height of [900, 720]) {
    const { context, page } = await at(browser, 1440, height, false);
    try {
      await page.goto(LIVE);
      // Positive evidence that script really is off: no map booted, and the
      // bar is still the server's `absolute`, never mount's `fixed`.
      expect(
        await page.$$eval(MAP, (els) => els.map((el) => el.hasAttribute("data-map-ready"))),
        "no map booted, because nothing ran",
      ).not.toContain(true);
      expect(
        await page.$eval("nav[aria-label='Primary']", (el) => getComputedStyle(el).position),
      ).toBe("absolute");
      for (const id of await sections(page)) {
        const read = await pinnedMidSection(page, id);
        expectPinned(`${id} @${height}, no JS`, read);
        const { a } = read;
        if (height === 900) {
          expect(
            Math.abs(a.map.centre - a.innerHeight / 2),
            `${id}, no JS: map centre ${a.map.centre}`,
          ).toBeLessThanOrEqual(PX);
        } else {
          expect(
            Math.abs(a.map.top - a.stickyTop),
            `${id}, no JS: map top ${a.map.top} against the server's --sticky-top ${a.stickyTop}`,
          ).toBeLessThanOrEqual(PX);
          if (a.divider.sticky)
            expect(
              a.map.top,
              `${id}, no JS: clear of its pinned divider (${a.divider.bottom})`,
            ).toBeGreaterThanOrEqual(a.divider.bottom - PX);
        }
      }
    } finally {
      await context.close();
    }
  }
});

// ── 4: a press still lands its card on the line the map is centred on ──────

const onCentreLine = (sec: Locator) =>
  sec.evaluate((el) => {
    const mid = window.innerHeight / 2;
    for (const li of el.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const b = li.getBoundingClientRect();
      if (b.top <= mid && b.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

const garnetIds = (sec: Locator) =>
  sec.evaluate(
    (el, garnet) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")]
        .filter((li) => getComputedStyle(li.querySelector("article")!).backgroundColor === garnet)
        .map((li) => li.dataset.centreId!),
    GARNET,
  );

test("1440x900: a pressed pin lands its card on the centre line, garnet, with the camera on it", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { context, page } = await at(browser, 1440, 900);
  try {
    await page.goto(LIVE);
    await hydrated(page);
    const [first] = await sections(page);
    const section = sectionOf(page, first!);
    const map = section.locator(MAP);
    await expect(map).toHaveAttribute("data-map-ready", "", { timeout: 45_000 });

    // Start with the MIDDLE card of the column on the centre line — the map is
    // pinned there — and the highlight settled on it. By a card rather than by
    // a scroll offset, because the line can fall in the 20px gap between two
    // cards, and then nothing is garnet but the fallback.
    const order = await section.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => li.dataset.centreId!),
    );
    expect(order.length, "listings to press between").toBeGreaterThan(2);
    const before = order[Math.floor(order.length / 2)]!;
    await section
      .locator(`[data-centre-id="${before}"]`)
      .evaluate((li) => li.scrollIntoView({ block: "center", behavior: "instant" }));
    expect(await onCentreLine(section), "the middle card is on the line").toBe(before);
    await expect.poll(() => garnetIds(section), { timeout: MOVE_TIMEOUT }).toEqual([before]);
    const pinned = await map.evaluate((el) => getComputedStyle(el).position);
    expect(pinned, "the map is sticky here").toBe("sticky");

    // The pin to press: a single pin (not a group), fully inside the window,
    // that a real pointer would hit, for the listing FURTHEST down the column
    // from the current one — so the press has to scroll the page.
    const { box, markers } = await steadyMarkers(map, "the land map's markers");
    const mapRect = await map.evaluate((el) => el.getBoundingClientRect().toJSON());
    const candidates = [];
    for (const m of markers) {
      if (!m.id || m.id === before) continue;
      const x = mapRect.left + m.x + m.w / 2;
      const y = mapRect.top + m.y + m.h * 0.35;
      const hit = await page.evaluate(
        ([x, y, id]) =>
          document
            .elementFromPoint(x, y)
            ?.closest("[data-map-pin]")
            ?.getAttribute("data-map-pin") === id,
        [x, y, m.id] as const,
      );
      if (hit && m.x >= 0 && m.y >= 0 && m.x + m.w <= box.w && m.y + m.h <= box.h)
        candidates.push({
          id: m.id,
          x,
          y,
          far: Math.abs(order.indexOf(m.id) - order.indexOf(before)),
        });
    }
    expect(candidates.length, "a single pin a pointer can press").toBeGreaterThan(0);
    const target = candidates.sort((a, b) => b.far - a.far)[0]!;
    expect(target.far, "and its card is not the one already on the line").toBeGreaterThan(0);

    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.click(target.x, target.y);

    // THE CARD: garnet, alone, and on the window's centre line by an
    // independent box test.
    await expect
      .poll(() => garnetIds(section), {
        message: `pressing ${target.id}'s pin makes its card the garnet one`,
        timeout: MOVE_TIMEOUT,
      })
      .toEqual([target.id]);
    expect(await onCentreLine(section), "its card is the one on the centre line").toBe(target.id);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - y0),
      "the press really scrolled the page",
    ).toBeGreaterThan(100);

    // THE CAMERA: the pressed listing's own pin tip at the map's middle, 4px
    // below it (the frame pads 52 top against 44 bottom).
    await expect
      .poll(
        async () => {
          const pin = (await placedPin(map, target.id, `${target.id}'s pin`))?.point;
          const b = await map.evaluate((el) => el.getBoundingClientRect().toJSON());
          return pin
            ? [Math.round(pin.x - b.width / 2) + 0, Math.round(pin.y - (b.height / 2 + 4)) + 0]
            : "no pin of its own";
        },
        { message: `the camera is on ${target.id}`, timeout: 15_000 },
      )
      .toEqual([0, 0]);

    // AND THE MAP IS LEVEL WITH IT: the pressed card spans the line the map's
    // own centre is on, which is the point of centring the map.
    const level = await section.evaluate((el, id) => {
      const card = el.querySelector(`[data-centre-id="${id}"]`)!.getBoundingClientRect();
      const m = el.querySelector("[data-property-map]")!.getBoundingClientRect();
      const mapCentre = (m.top + m.bottom) / 2;
      return {
        mapCentre,
        cardTop: card.top,
        cardBottom: card.bottom,
        cardCentreBelowMapCentre: (card.top + card.bottom) / 2 - mapCentre,
      };
    }, target.id);
    // Recorded, not asserted: where the card's CENTRE lands against the map's.
    // `revealCard` centres the card in the scrollport less `scroll-padding-top`
    // and its own scroll margin, so it sits a little below the map's centre.
    console.log(`press ${JSON.stringify({ from: before, to: target.id, level })}`);
    expect(level.cardTop, "the card starts above the map's centre").toBeLessThanOrEqual(
      level.mapCentre,
    );
    expect(level.cardBottom, "and ends below it").toBeGreaterThanOrEqual(level.mapCentre);
  } finally {
    await context.close();
  }
});
