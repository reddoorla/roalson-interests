import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { axe } from "./axe";
import { hydrated } from "./hydrated";

// #52: axe's default preload fetches every stylesheet, and `connect-src` has no
// fonts.googleapis.com, so each audit logged a CSP violation. The control runs
// the default builder on the same page, so a pass here is not a CSP that has
// simply stopped reporting.
//
//   pnpm exec playwright test tests/interaction/axe-preload.spec.ts
const FIXTURE = "/dev/a11y-fixtures";

test.skip(process.env.REDDOOR_GATE_SERVER === "preview", "/dev/* 404s on a production build");

async function connectSrcAfter(page: Page, run: () => Promise<unknown>) {
  const reports: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("connect-src")) reports.push(m.text());
  });
  await page.goto(FIXTURE);
  await hydrated(page);
  await run();
  return reports;
}

test("the default builder's preload is refused by connect-src (control)", async ({ page }) => {
  const reports = await connectSrcAfter(page, () =>
    new AxeBuilder({ page }).withTags(["wcag2a"]).analyze(),
  );
  expect(reports.join("\n")).toContain("fonts.googleapis.com");
});

test("the specs' axe does not preload, so the CSP stays quiet", async ({ page }) => {
  const reports = await connectSrcAfter(page, () => axe(page).withTags(["wcag2a"]).analyze());
  expect(reports).toEqual([]);
});
