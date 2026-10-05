import { expect, test, type Browser, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";

// THE VIEW TABS' SELECTED STATE, AS A SCREEN READER GETS IT (#178). Hydrated,
// the selected tab carries aria-current. With no script the server cannot know
// the fragment and CSS cannot set an attribute, so app.css appends a visually
// hidden "(selected)" to the `:target`-matched tab, and drops it once
// `data-view` exists so the state is never announced twice.
//
// The names are CHROME's, read from its accessibility tree over CDP: the tree
// a screen reader is handed, not Playwright's own name computation. Chrome
// applies the tabs' `uppercase` to the name ("LAND"), so the pseudo-element
// sets `normal-case` and the state reads as a word, not as capitals. The
// label's case is the tabs' type style and is folded before comparing; the
// state's is not.
//
//   pnpm exec playwright test tests/interaction/listing-views-name.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/listing-views-name.spec.ts
const FIXTURE = "/dev/properties";
const LIVE = "/properties";
const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const LABELS = { land: "land", improved: "improved properties", all: "all" } as const;
type View = keyof typeof LABELS;
const VIEWS = Object.keys(LABELS) as View[];

/** Each tab's accessible name, whitespace collapsed and its label lower-cased,
 *  keyed by view. */
async function tabNames(page: Page): Promise<Record<View, string>> {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const names = {} as Record<View, string>;
  for (const view of VIEWS) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: `[data-view-tab="${view}"]`,
    });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
      nodeId,
      fetchRelatives: false,
    });
    names[view] = String(nodes[0]?.name?.value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(
        /^(.*?)( \(selected\))?$/i,
        (_, label: string, state: string | undefined) => label.toLowerCase() + (state ?? ""),
      );
  }
  await cdp.detach();
  return names;
}

const selectedIn = (view: View) =>
  Object.fromEntries(VIEWS.map((v) => [v, v === view ? `${LABELS[v]} (selected)` : LABELS[v]]));

async function noScript(browser: Browser, url: string) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const res = await page.goto(url);
  expect(res?.status()).toBe(200);
  return { context, page };
}

test.describe("with no script", { tag: "@smoke" }, () => {
  test.skip(PREVIEW, "/dev/* 404s on a production build (#120)");

  for (const [hash, view] of [
    ["", "all"],
    ["#land", "land"],
    ["#improved", "improved"],
  ] as const) {
    test(`${hash || "no fragment"}: only the ${view} tab's name says it is selected`, async ({
      browser,
    }) => {
      const { context, page } = await noScript(browser, `${FIXTURE}${hash}`);
      expect(await tabNames(page)).toEqual(selectedIn(view));
      // No attribute without script: the name is the only carrier.
      await expect(page.locator("[data-view-tab][aria-current]")).toHaveCount(0);
      await context.close();
    });
  }

  test("a tab press moves the state to the pressed tab", async ({ browser }) => {
    const { context, page } = await noScript(browser, FIXTURE);
    await page.locator('[data-view-tab="improved"]').click();
    await expect(page).toHaveURL(/#improved$/);
    expect(await tabNames(page)).toEqual(selectedIn("improved"));
    await context.close();
  });
});

test.describe("hydrated", { tag: "@smoke" }, () => {
  test.skip(PREVIEW, "/dev/* 404s on a production build (#120)");

  test("aria-current carries the state and the name no longer does", async ({ page }) => {
    await page.goto(`${FIXTURE}#land`);
    await hydrated(page);
    await expect(page.locator('[data-view-tab="land"]')).toHaveAttribute("aria-current", "true");
    expect(await tabNames(page)).toEqual(LABELS);
  });
});

test.describe("live", { tag: "@smoke" }, () => {
  test.skip(!PREVIEW, "the real portfolio is read on the production build");

  test("/properties#land names the Land tab selected with no script", async ({ browser }) => {
    const { context, page } = await noScript(browser, `${LIVE}#land`);
    expect(await tabNames(page)).toEqual(selectedIn("land"));
    await context.close();
  });
});
