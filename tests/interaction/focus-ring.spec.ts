import { expect, test, type Locator } from "@playwright/test";
import { expectRing, GARNET, OFF_WHITE } from "./expect-ring";
import { HYDRATION_TIMEOUT, hydrated } from "./hydrated";

/** `expectRing` for a property card's LEARN MORE, WITHOUT MOVING THE PAGE, and
 *  with the card's own ground read in the same synchronous block.
 *
 *  Which card is garnet follows the centre line (PropertyListing.svelte), and
 *  `expectRing`'s Tab is a scroll: from card 0's link it lands on card 1's, the
 *  browser brings it into view, and on the fixture at 1440x900 that puts card
 *  1 across the middle (top 272). Card 1 then IS the garnet card and its ring
 *  is correctly off-white. The old "card 1 is sand" read was a race between
 *  the poll and the observer, and lost it under `pnpm verify`'s load. So this
 *  focuses with `preventScroll` and no Tab (the page is already in keyboard
 *  modality from the bar's check), and asserts the ground as well as the ring,
 *  so a pass says which ground it was measured on. */
async function expectCardRing(card: Locator, ground: string, color: string) {
  await expect
    .poll(
      () =>
        card.getByRole("link").evaluate((el) => {
          (el as HTMLElement).focus({ preventScroll: true });
          const cs = getComputedStyle(el);
          return {
            ground: getComputedStyle(el.closest("article")!).backgroundColor,
            showing: el.matches(":focus-visible"),
            color: cs.outlineColor,
            width: cs.outlineWidth,
            style: cs.outlineStyle,
          };
        }),
      { timeout: HYDRATION_TIMEOUT },
    )
    .toEqual({ ground, showing: true, color, width: "2px", style: "solid" });
}

const SAND = "rgb(232, 225, 209)";

// The keyboard-focus ring is drawn OUTSIDE its element, so what it has to be
// legible against is the container's ground. It was garnet on every ground —
// 1:1 on the garnet card and the nav overlay. src/app.css now has each ground
// set `--focus-ring` for its children; jsdom resolves no stylesheets, so the
// cascade can only be checked here.
const FIXTURE = "/dev/properties";
const bar = 'nav[aria-label="Primary"]';

test("the ring is off-white on dark grounds and garnet on light ones", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FIXTURE);
  await hydrated(page);

  // The floating bar has no ground of its own: it borrows the masthead's.
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
  await expectRing(page, page.getByLabel("Open menu"), OFF_WHITE);

  // The garnet card: its LEARN MORE sits on bg-primary…
  const cards = page.locator("main article");
  await expectCardRing(cards.nth(0), GARNET, OFF_WHITE);
  // …and the sand card beside it, inside the same section, gets garnet back.
  await expectCardRing(cards.nth(1), SAND, GARNET);

  // AND THE GROUND CAN CHANGE UNDER A RING THAT IS SHOWING. With card 1's link
  // still focused, put card 1 on the centre line: it takes the garnet tone,
  // and a ring left garnet on it would be 1:1.
  await page.evaluate(() =>
    document
      .querySelectorAll("main article")[1]!
      .scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expectCardRing(cards.nth(1), GARNET, OFF_WHITE);

  // Once the bar has taken its off-white ground, so has its ring.
  await page.mouse.wheel(0, 600);
  await expect(page.locator(bar)).not.toHaveAttribute("data-floating", "");
  await expectRing(page, page.getByLabel("Open menu"), GARNET);
});

test("the ring is off-white inside the menu, which is a gradient with no bg-* at all", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FIXTURE);
  await hydrated(page);
  await page.getByLabel("Open menu").click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expectRing(page, page.getByLabel("Close menu"), OFF_WHITE);
  await expectRing(page, menu.locator("ul a").first(), OFF_WHITE);
});

test("the homepage's hero buttons sit on the garnet band, and their ring is off-white", async ({
  page,
}) => {
  // The review of the hero batch caught this at its pre-rebase head: two CTAs on
  // a `from-primary` gradient with a garnet ring, 1:1. The ground rule fixes it
  // without the slice knowing — this holds that.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/home");
  await hydrated(page);
  const cta = page.locator("main h1 ~ * a, main h1 + * a").first();
  await expect(cta).toBeVisible();
  await expectRing(page, cta, OFF_WHITE);
});
