import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";

const PROPERTY = "/dev/property";
const CDN = "https://roalson-interests.cdn.prismic.io/roalson-interests/xYz123_package.pdf";

test(
  "the property package opens in a new tab and leaves the listing where it was",
  { tag: "@smoke" },
  async ({ page, context }) => {
    await context.route(CDN, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "content-disposition": 'inline; filename="xYz123_package.pdf"' },
        body: "%PDF-1.4\n%%EOF\n",
      }),
    );
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await page.goto(PROPERTY);
    await hydrated(page);
    const link = page.getByRole("link", { name: /Property package/ });
    await link.evaluate((a, href) => a.setAttribute("href", href), CDN);
    const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
    await popup.waitForURL(CDN);
    expect(popup.url()).toBe(CDN);
    await expect(page).toHaveURL(new RegExp(`${PROPERTY}$`));
    expect(downloaded).toBe(false);
  },
);
