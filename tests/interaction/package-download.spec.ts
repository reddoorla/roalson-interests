import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";

// MarkUp, 2026-10-01 (Properties #3): the property package button saves the
// PDF rather than opening it. The fixture's package is served here as the CDN
// serves the real ones, `inline`, so a bare `download` attribute on a
// cross-origin link would not do it; see $lib/download.
const PROPERTY = "/dev/property";

const CDN = "https://roalson-interests.cdn.prismic.io/roalson-interests/xYz123_package.pdf";

test(
  "the property package saves under its own name when pressed, from another origin",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.route(CDN, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "content-disposition": 'inline; filename="xYz123_package.pdf"',
          "access-control-allow-origin": "*",
        },
        body: "%PDF-1.4\n%%EOF\n",
      }),
    );
    await page.goto(PROPERTY);
    await hydrated(page);
    const link = page.getByRole("link", { name: /Property package/ });
    // The real packages are on Prismic's CDN; the fixture's is same-origin,
    // where a bare `download` attribute would pass this on its own.
    await link.evaluate((a, href) => a.setAttribute("href", href), CDN);
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe("25331 IH 10 West package.pdf");
    await expect(page).toHaveURL(new RegExp(`${PROPERTY}$`));
  },
);
