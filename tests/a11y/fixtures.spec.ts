import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { path: "/dev/a11y-fixtures", name: "a11y fixtures" },
  { path: "/dev/animate-in", name: "animate-in demo" },
];

for (const { path, name } of pages) {
  test(`${name} has no axe violations`, async ({ page }) => {
    // Audit under reduced-motion: the animate-in effects no-op (elements render
    // at full opacity immediately), so axe never samples a mid-fade element —
    // whose blended color would trip a spurious color-contrast violation. This
    // is also the correct a11y baseline (motion-averse users see this state).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    // The layout's skip link + main landmark render on every page (WCAG 2.4.1).
    await expect(page.locator('a[href="#main-content"]')).toHaveCount(1);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    // A rule that THROWS is not a pass. axe files it under `incomplete` with an
    // `error-occurred` check and skips that rule for the WHOLE page, so
    // `violations` comes back empty and this test used to go green. That is
    // exactly what happened (roalson-interests, 2026-09-18): Tailwind 4.3
    // defines its neutral palette as `oklch(… 0 none)`, axe-core 4.13 cannot
    // parse `none`, and one `bg-neutral-900` in the Hero slice switched
    // color-contrast off for every fixture on this page — a 1.73:1 dust label
    // added on purpose went unreported.
    const crashed = results.incomplete.flatMap((rule) =>
      rule.nodes.flatMap((node) =>
        [...node.any, ...node.all, ...node.none]
          .filter((check) => check.id === "error-occurred")
          .map(
            (check) =>
              `${rule.id}: ${(check.data as { message?: string } | null)?.message ?? check.message}`,
          ),
      ),
    );
    expect(crashed, "axe rules crashed, so they measured nothing on this page").toEqual([]);

    // …and the positive half: contrast is the check that has failed on real
    // sites, so require evidence that it actually measured something. An empty
    // `violations` alone cannot tell "all legible" from "never looked".
    const contrast = results.passes.find((rule) => rule.id === "color-contrast");
    expect(contrast?.nodes.length ?? 0, "color-contrast measured no text at all").toBeGreaterThan(
      0,
    );

    expect(results.violations).toEqual([]);
  });
}
