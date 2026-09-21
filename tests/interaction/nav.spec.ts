import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The bar makes two promises jsdom cannot check (see Nav.svelte):
//
//  1. it FLOATS — no ground, white wordmark, dust controls — only over a dark
//     first band, and takes the page's off-white ground once the page moves;
//  2. it never needs script to stay legible: a floating bar is `absolute` in
//     the server's markup and is pinned only once script has mounted, and the
//     menu's links reach a browser that will never open the menu.
//
// Both fixtures render through the real layout. DARK opens on PageMasthead and
// claims `navOver`; LIGHT opens on the property page and claims nothing.
const DARK = "/dev/properties";
const LIGHT = "/dev/property";

const OFF_WHITE = "rgb(242, 239, 233)";
const GARNET = "rgb(101, 35, 35)";
const DUST = "rgb(178, 172, 159)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

const bar = 'nav[aria-label="Primary"]';

/** On a page that opens on a dark band the server ships the bar `absolute`
 *  and only mount pins it — so `fixed` is positive evidence that script has
 *  adopted the bar, and that the trigger's handler exists. A click before it
 *  lands on server markup and opens nothing. */
const adopted = (page: Page) => expect(page.locator(bar)).toHaveCSS("position", "fixed");

test("the server ships a floating bar unpinned, with the menu's links beside it", async ({
  page,
}) => {
  const html = await (await page.request.get(DARK)).text();
  const nav = /<nav[^>]*aria-label="Primary"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
  const open = /<nav[^>]*>/.exec(nav)?.[0] ?? "";

  expect(open, "floating in the markup").toContain("data-floating");
  expect(open, "not pinned until script adopts it").toMatch(/class="[^"]*\babsolute\b/);
  expect(open).not.toMatch(/class="[^"]*\bfixed\b/);

  const noscript = /<noscript[^>]*>([\s\S]*?)<\/noscript>/.exec(nav)?.[1] ?? "";
  expect(noscript, "the listing is reachable without the menu").toContain('href="/properties"');
  expect(noscript).toContain('href="/contact"');
  expect(nav, "the trigger is marked for the noscript rule").toMatch(
    /<button[^>]*data-js-only[^>]*aria-label="Open menu"|<button[^>]*aria-label="Open menu"[^>]*data-js-only/,
  );
});

test("with scripting off, the floating bar stays on its dark band and the links are in it", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(DARK, { waitUntil: "domcontentloaded" });

    await expect(page.locator(bar)).toHaveCSS("position", "absolute");
    await expect(page.locator(bar)).toHaveCSS("background-color", TRANSPARENT);
    await expect(page.getByLabel("Open menu"), "a button that can do nothing").toBeHidden();

    const links = page.locator(`${bar} noscript a`);
    await expect(links).toHaveText(["Our Properties", "Contact Us"]);
    await expect(links.first()).toBeVisible();
    await expect(links.first()).toHaveCSS("color", DUST);
    // At this width the CTA is in the bar and already is the second link…
    await expect(links.nth(1)).toBeHidden();
    await expect(page.locator(`${bar} a`, { hasText: "Contact us" }).last()).toBeVisible();

    // …and at 390 it is not, so the list carries it — and still fits the bar.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(links.nth(1)).toBeVisible();
    const lastLink = await links.nth(1).boundingBox();
    const narrow = await page.evaluate(() => document.documentElement.clientWidth);
    expect(lastLink!.x + lastLink!.width, "inside the 20px gutter").toBeLessThanOrEqual(
      narrow - 20,
    );
    expect(lastLink!.y, "on the bar's one line").toBeLessThan(70);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Never over light content: it left with the band it was toned for.
    const masthead = await page.locator("main header").first().boundingBox();
    const barBox = await page.locator(bar).boundingBox();
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(masthead!.y + masthead!.height);
  } finally {
    await context.close();
  }
});

test("with scripting off, a solid bar is pinned and legible from the server's markup", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(LIGHT, { waitUntil: "domcontentloaded" });
    await expect(page.locator(bar)).toHaveCSS("position", "fixed");
    await expect(page.locator(bar)).toHaveCSS("background-color", OFF_WHITE);
    await expect(page.locator(`${bar} noscript a`).first()).toHaveCSS("color", GARNET);
  } finally {
    await context.close();
  }
});

test("the bar floats over the masthead, and takes its ground when the page moves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DARK);
  const trigger = page.getByLabel("Open menu");
  const cta = page.locator(`${bar} a`, { hasText: "Contact us" });

  // Adopted by script: pinned, and at scroll 0 that paints where `absolute` did.
  await expect(page.locator(bar)).toHaveCSS("position", "fixed");
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
  await expect(page.locator(bar)).toHaveCSS("background-color", TRANSPARENT);
  await expect(trigger).toHaveCSS("color", DUST);
  await expect(cta).toHaveCSS("color", DUST);

  // The scripting-off list is in the tree here too — as raw text inside a
  // <noscript> that Chromium gives no box. `display: contents` on that element
  // hands the text to the bar to lay out: `class="contents"` was the first
  // draft, and it printed the list's markup across the bar at 390.
  await expect(page.locator(`${bar} noscript`)).toBeHidden();
  expect(await page.locator(bar).innerText()).not.toContain("<li>");

  // The masthead runs UNDER the bar, as the comp draws it.
  expect((await page.locator("main header").first().boundingBox())!.y).toBe(0);
  expect((await page.locator(bar).boundingBox())!.height).toBe(80);

  await page.mouse.wheel(0, 600);
  await expect(page.locator(bar)).not.toHaveAttribute("data-floating", "");
  await expect(page.locator(bar)).toHaveCSS("background-color", OFF_WHITE);
  await expect(trigger).toHaveCSS("color", GARNET);
  await expect(cta).toHaveCSS("color", GARNET);

  await page.mouse.wheel(0, -600);
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
});

test("a page that opens on a light band clears the bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LIGHT);
  await expect(page.locator(bar)).toHaveCSS("background-color", OFF_WHITE);
  const barBox = await page.locator(bar).boundingBox();
  const first = await page.locator("main#main-content > *").first().boundingBox();
  expect(first!.y, "nothing starts under the bar").toBeGreaterThanOrEqual(barBox!.height);

  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator(bar).boundingBox())!.height).toBe(70);
  const firstMobile = await page.locator("main#main-content > *").first().boundingBox();
  expect(firstMobile!.y).toBeGreaterThanOrEqual(70);
});

test("the open menu: named, focused, locked, clean under axe, and closed by Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DARK);
  await adopted(page);
  // The LAYOUT's width, not the window's: the CI runner's Chromium draws a
  // 15px classic scrollbar (layout 1425 in a 1440 window) and macOS headless
  // draws none. The first version of this test said `1440 - 80 - 10`, passed
  // here, and failed there on 1335.
  const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const triggerBox = await page.getByLabel("Open menu").boundingBox();
  await page.getByLabel("Open menu").click();

  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(page.getByLabel("Close menu")).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await expect(menu.locator("ul a")).toHaveText(["Home", "Our Properties", "Contact Us"]);
  // The fixture is not a real destination, so nothing is current here…
  await expect(menu.locator('[aria-current="page"]')).toHaveCount(0);

  // The Close sits exactly where the trigger was — and the trigger's GLYPH,
  // not its 44px target, ends on the comp's gutter (x=1360, centred on y=40).
  expect(await page.getByLabel("Close menu").boundingBox()).toEqual(triggerBox);
  expect(triggerBox!.x + triggerBox!.width / 2).toBe(layoutWidth - 80 - 10);
  expect(triggerBox!.y + triggerBox!.height / 2).toBe(40);

  const results = await new AxeBuilder({ page })
    .include("#nav-menu")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const crashed = results.incomplete.flatMap((rule) =>
    rule.nodes.flatMap((node) =>
      [...node.any, ...node.all, ...node.none].filter((check) => check.id === "error-occurred"),
    ),
  );
  expect(crashed, "axe rules crashed, so they measured nothing").toEqual([]);
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByLabel("Open menu")).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("locking the page behind the menu does not move it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DARK);
  await adopted(page);
  // Only meaningful where scrollbars take layout space — the Linux CI runner
  // (layout 1425 in a 1440 window), Windows. macOS headless Chromium draws
  // overlay scrollbars, and nothing forces a classic one there: five
  // ::-webkit-scrollbar / overflow variants under two launch modes all left
  // clientWidth at 1440 (2026-09-20). So this passes vacuously on a Mac, and
  // `layout` is in the compared object so a CI failure says what it measured.
  const width = () =>
    page.evaluate(() => ({
      layout: document.documentElement.clientWidth,
      main: document.querySelector("main#main-content")!.getBoundingClientRect().width,
      padding: getComputedStyle(document.body).paddingRight,
    }));
  const before = await width();

  await page.getByLabel("Open menu").click();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  // app.css keeps the gutter (`scrollbar-gutter: stable`), so hiding overflow
  // gives the layout nothing back — and a lock that pays padding for a
  // scrollbar that never left narrows the page behind the menu.
  expect(await width()).toEqual(before);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  expect(await width()).toEqual(before);
});

test("the menu marks the page you are on", async ({ page }) => {
  await page.goto("/properties");
  await adopted(page);
  await page.getByLabel("Open menu").click();
  const current = page.getByRole("dialog", { name: "Menu" }).locator('[aria-current="page"]');
  await expect(current).toHaveText(["Our Properties"]);
});
