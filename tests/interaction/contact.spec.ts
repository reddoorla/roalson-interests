import { expect, test, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The contact page makes promises jsdom cannot check: that its two columns
// stand on the site's one grid, that a field is the height and the border the
// skin says, what a focused field paints, and — the one that was a defect —
// where the alert and the confirmation LAND when script moves focus to them
// under a pinned bar.
//
// /contact answers 200 on the placeholder repository (its `load` touches no
// CMS), so unlike the homepage specs this one runs against the real route.
//
// House rules, paid for in nav.spec.ts and footer.spec.ts: no x derived from
// the window (the runner lays out 15px narrower than it reports) — every
// position here is relative to another element; sizes after setViewportSize
// are auto-retrying; nothing is clicked before script has provably run; and
// the shared config forces `reducedMotion: "reduce"`, so the test that needs
// the smooth scroll opens its own context.
//
// NO TEST HERE MAY DELIVER A LEAD. Both submissions below are answered by the
// site's own server without calling ingest — the failure because ingest is
// not configured, the confirmation because the honeypot screens it out — and
// that is only true while FORMS_INGEST_* are unset. `ingestIsDark` reads
// /health and the tests SKIP when they are set. A skip is not a pass.
const ROUTE = "/contact";
const FIXTURES = "/dev/a11y-fixtures";

const GARNET = "rgb(101, 35, 35)";
const ERROR = "rgb(185, 28, 28)";
const SAND = "rgb(232, 225, 209)";

const bar = 'nav[aria-label="Primary"]';
const office = 'section[aria-labelledby="contact-office"]';
const formSection = "section#contact-form";

/** Positive evidence of hydration: only the footer's own effect writes this,
 *  in the same pass that attaches `use:enhance` to the form. */
const hydrated = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--footer-h")))
    .toMatch(/^\d+(\.\d+)?px$/);

async function ingestIsDark(page: Page): Promise<boolean> {
  const health = await (await page.request.get("/health")).json();
  return !(health.forms.ingestUrl && health.forms.ingestToken);
}

/** Fill the three required fields and age the timing token past MIN_FILL_MS,
 *  so the submission reaches the action's config check instead of being
 *  screened out as too fast (which answers success — see the honeypot test). */
async function fillValid(page: Page) {
  await page.getByLabel(/^Name/).fill("Ada Lovelace");
  await page.getByLabel(/^Email/).fill("ada@example.com");
  await page.getByLabel(/^Message/).fill("A message from tests/interaction/contact.spec.ts.");
  await page.evaluate(() => {
    const ts = document.querySelector<HTMLInputElement>('input[name="ts"]')!;
    ts.value = String(Date.now() - 60_000);
  });
}

/** Tab to the submit and press Enter in the same breath, as a keyboard user
 *  does. Focusing the button starts a scroll; the answer arrives during it. */
async function submitByKeyboard(page: Page) {
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Send message" }).focus();
  await page.keyboard.press("Enter");
}

/** Resolves once two consecutive samples of scrollY agree — a glide is over. */
async function still(page: Page) {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => Math.round(scrollY));
      const same = y === last;
      last = y;
      return same;
    })
    .toBe(true);
}

/** Where a panel sits against the pinned bar, once the page has stopped moving. */
async function landing(page: Page, selector: string) {
  await still(page);
  return page.evaluate(
    ([panel, nav]) => {
      const el = document.querySelector(panel)!;
      const b = el.getBoundingClientRect();
      return {
        top: b.top,
        bottom: b.bottom,
        barBottom: document.querySelector(nav)!.getBoundingClientRect().bottom,
        viewport: innerHeight,
        focused: document.activeElement === el,
      };
    },
    [selector, bar],
  );
}

test("at 1440 both columns stand on the site's grid, and the fields keep the skin's geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE);
  await hydrated(page);
  await expect(page.locator(`${formSection} input[name="name"]`)).toHaveCSS("height", "48px");

  const g = await page.evaluate(
    ([officeSel, formSel]) => {
      const box = (el: Element | null) => {
        if (!el) throw new Error("missing element");
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height };
      };
      const main = document.querySelector("main")!;
      const masthead = main.querySelector("header")!;
      const container = masthead.nextElementSibling!;
      const pad = getComputedStyle(container);
      const officeEl = document.querySelector(officeSel)!;
      const formEl = document.querySelector(formSel)!;
      const rule = (section: Element) => {
        const el = section.firstElementChild!;
        const cs = getComputedStyle(el);
        return { ...box(el), width: cs.borderTopWidth, color: cs.borderTopColor };
      };
      const control = (name: string) => box(formEl.querySelector(`[name="${name}"]`));
      const label = (name: string) =>
        box(formEl.querySelector(`label[for="${formEl.querySelector(`[name="${name}"]`)!.id}"]`));
      return {
        mainTop: box(main).top,
        masthead: box(masthead),
        h1: box(masthead.querySelector("h1")),
        contentLeft: box(container).left + parseFloat(pad.paddingLeft),
        contentRight: box(container).right - parseFloat(pad.paddingRight),
        office: box(officeEl),
        form: box(formEl),
        rules: [rule(officeEl), rule(formEl)],
        controls: {
          name: control("name"),
          email: control("email"),
          phone: control("phone"),
          message: control("message"),
        },
        labels: { name: label("name"), email: label("email") },
        submit: box(formEl.querySelector('button[type="submit"]')),
        directions: box(officeEl.querySelector('a[target="_blank"]')),
      };
    },
    [office, formSection],
  );
  const near = (actual: number, expected: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
      0.6,
    );

  // The masthead runs under the bar from the top of <main>: the layout dropped
  // its top padding because the route CLAIMED the dark band.
  near(g.masthead.top, g.mainTop, "masthead starts where main does");
  near(g.masthead.height, 400, "masthead height");

  // One vertical line through the site: the form column starts where the
  // masthead's H1 does. Compared with the H1, never with a number off the window.
  near(g.form.left, g.h1.left, "form column on the H1's line");
  near(g.office.left, g.contentLeft, "office column on the gutter");
  near(g.form.right, g.contentRight, "form column reaches the gutter");
  near(g.form.left - g.office.right, 36, "the grid's gap");
  near((g.form.right - g.form.left) / (g.office.right - g.office.left), 847 / 397, "397fr / 847fr");

  // The listing page's divider, twice: 2px garnet, level, 40 under the band.
  for (const rule of g.rules) {
    expect(rule.width).toBe("2px");
    expect(rule.color).toBe(GARNET);
    near(rule.top - g.masthead.bottom, 40, "rule 40 under the masthead");
  }

  // The skin: 48px inputs, a 168px textarea, a 40px button; 10 under a label,
  // 30 between rows; email and phone share a row.
  near(g.controls.name.height, 48, "input height");
  near(g.controls.email.height, 48, "input height");
  near(g.controls.message.height, 168, "textarea height");
  near(g.submit.height, 40, "submit height");
  near(g.directions.height, 40, "directions height");
  near(g.controls.name.top - g.labels.name.bottom, 10, "label to control");
  near(g.labels.email.top - g.controls.name.bottom, 30, "row pitch");
  near(g.controls.email.top, g.controls.phone.top, "email and phone share a row");
  near(g.controls.phone.left - g.controls.email.right, 20, "email | phone gap");
  near(g.submit.top - g.controls.message.bottom, 30, "message to submit");
  near(g.submit.left, g.form.left, "submit hugs the column's left edge");
  expect(g.submit.right, "submit is not stretched").toBeLessThan(g.form.left + 300);
});

test("at 390 the office stacks above the form and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE);
  await hydrated(page);
  await expect(page.locator("main header")).toHaveCSS("height", "240px");

  const g = await page.evaluate(
    ([officeSel, formSel]) => {
      const b = (el: Element) => el.getBoundingClientRect();
      const officeEl = document.querySelector(officeSel)!;
      const formEl = document.querySelector(formSel)!;
      const controls = ["name", "email", "phone", "message"].map((n) =>
        b(formEl.querySelector(`[name="${n}"]`)!),
      );
      return {
        officeBottom: b(officeEl).bottom,
        formTop: b(formEl).top,
        officeLeft: b(officeEl).left,
        formLeft: b(formEl).left,
        formWidth: b(formEl).width,
        controlWidths: controls.map((c) => c.width),
        controlTops: controls.map((c) => c.top),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    },
    [office, formSection],
  );
  expect(g.formTop - g.officeBottom, "40 between the stacked blocks").toBeCloseTo(40, 0);
  expect(g.formLeft).toBeCloseTo(g.officeLeft, 0);
  for (const w of g.controlWidths) expect(w).toBeCloseTo(g.formWidth, 0);
  // Stacked: every control below the one before it, email and phone included.
  expect([...g.controlTops].sort((a, z) => a - z)).toEqual(g.controlTops);
  expect(new Set(g.controlTops.map(Math.round)).size).toBe(4);
  expect(g.overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
});

test("the bar floats over the masthead, and takes its ground once the page moves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE);
  await expect(page.locator(bar)).toHaveCSS("position", "fixed");
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
  await page.mouse.wheel(0, 600);
  await expect(page.locator(bar)).not.toHaveAttribute("data-floating", "");
});

test("a focused field gains a 2px garnet ring on its 1px border; an invalid one, the error colour", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE);
  await hydrated(page);

  const name = page.getByLabel(/^Name/);
  await expect(name).toHaveCSS("border-top-width", "1px");
  await expect(name).toHaveCSS("border-top-color", GARNET);
  await expect(name).toHaveCSS("border-top-left-radius", "0px");
  await expect(name).toHaveCSS("box-shadow", "none");

  // Polled: the ring arrives over `transition-[border-color,box-shadow]`.
  await name.focus();
  await expect
    .poll(() => name.evaluate((el) => getComputedStyle(el).boxShadow))
    .toMatch(/rgb\(101, 35, 35\) 0px 0px 0px 2px/);
  await expect(name).toHaveCSS("border-top-width", "1px");

  // The fixtures page renders Field with an error; /contact has no per-field
  // errors of its own (the action validates nothing).
  await page.goto(FIXTURES);
  const invalid = page.locator(
    'section[aria-labelledby="form-errors-heading"] input[name="email"]',
  );
  await expect(invalid).toHaveAttribute("aria-invalid", "true");
  await expect(invalid).toHaveCSS("border-top-color", ERROR);
  await invalid.focus();
  await expect
    .poll(() => invalid.evaluate((el) => getComputedStyle(el).boxShadow))
    .toMatch(/rgb\(185, 28, 28\) 0px 0px 0px 2px/);
});

/** A context that does NOT ask for reduced motion, so `html`'s smooth scroll
 *  is live — the shared config's default hides the race this test is for.
 *  `reducedMotion` is a parameter for the cases below that need BOTH. */
async function withMotion(
  browser: Browser,
  width: number,
  height: number,
  reducedMotion: "no-preference" | "reduce" = "no-preference",
) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  return { context, page: await context.newPage() };
}

for (const [width, height] of [
  [1440, 900],
  [390, 664],
] as const) {
  test(`a failed send lands its alert in view under the bar, focused, naming the phone (${width})`, async ({
    browser,
  }) => {
    const { context, page } = await withMotion(browser, width, height);
    try {
      await page.goto(ROUTE);
      test.skip(!(await ingestIsDark(page)), "FORMS_INGEST_* are set: this would send a lead");
      await hydrated(page);
      await fillValid(page);
      await submitByKeyboard(page);

      const alert = page.locator(`${formSection} [role="alert"]`);
      await expect(alert).toContainText("temporarily unavailable");
      await expect(alert).toContainText("(210) 496-5800");
      await expect(alert).not.toContainText(/e-?mail/i);

      const at = await landing(page, `${formSection} [role="alert"]`);
      expect(at.focused, "the alert holds focus").toBe(true);
      // The defect: top −8px behind an 80px bar at 1440. 20 under the bar is the
      // design, and it is asserted as a LANDING, not as "anywhere clear of it":
      // with plain focus() the landing is a race against the glide in flight.
      // Two runs of that mutation at 390 put the same alert in two places —
      // top at 340, and jammed against the viewport's bottom edge (bottom at
      // 664.09 of 664), which a lower-bound check passed and a side-check
      // caught by 0.09px.
      expect(at.top - at.barBottom, "20px under the pinned bar").toBeGreaterThanOrEqual(19);
      expect(at.top - at.barBottom, "20px under the pinned bar").toBeLessThanOrEqual(21);
      expect(at.bottom, "inside the viewport").toBeLessThanOrEqual(at.viewport);

      // The form survives a failure, with what was typed.
      await expect(page.getByLabel(/^Name/)).toHaveValue("Ada Lovelace");
      await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
    } finally {
      await context.close();
    }
  });
}

test("a screened-out send shows the confirmation in place of the form, focused, under the bar", async ({
  browser,
}) => {
  // The honeypot answers { success: true } BY DESIGN, so this proves the panel
  // and nothing about delivery — a lead reaching the dashboard can only be
  // shown on a deploy that has FORMS_INGEST_*.
  const { context, page } = await withMotion(browser, 1440, 900);
  try {
    await page.goto(ROUTE);
    test.skip(!(await ingestIsDark(page)), "FORMS_INGEST_* are set: this would post a screen-out");
    await hydrated(page);
    await fillValid(page);
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>('input[name="bot-field"]')!.value = "spec";
    });
    await submitByKeyboard(page);

    const status = page.locator(`${formSection} [role="status"]`);
    await expect(status).toContainText("your message is on its way");
    await expect(page.locator(`${formSection} form`)).toHaveCount(0);
    await expect(status).toHaveCSS("background-color", SAND);
    await expect(status.getByRole("link", { name: "(210) 496-5800" })).toHaveAttribute(
      "href",
      "tel:+12104965800",
    );

    const at = await landing(page, `${formSection} [role="status"]`);
    expect(at.focused, "the confirmation holds focus").toBe(true);
    // Plain focus() left it 45px BEHIND the bar (top at 35 of an 80px bar).
    expect(at.top - at.barBottom, "20px under the pinned bar").toBeGreaterThanOrEqual(19);
    expect(at.top - at.barBottom, "20px under the pinned bar").toBeLessThanOrEqual(21);

    // A focus TARGET is outside app.css's floor (tabindex="-1"), so it carries
    // the floor's declaration itself. Polled past the outline-color transition.
    await expect
      .poll(() =>
        status.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            showing: el.matches(":focus-visible"),
            ring: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
            offset: cs.outlineOffset,
          };
        }),
      )
      .toEqual({ showing: true, ring: `2px solid ${GARNET}`, offset: "2px" });
  } finally {
    await context.close();
  }
});

test("Form.svelte's error summary lands as the alert does: focused, 20px under the bar", async ({
  browser,
}) => {
  // The summary was the precedent the page's alert copied, plain focus() and
  // all, so it carried the same defect; both now go through $lib/utils/reveal.
  // Form is mounted only on the fixtures page, whose summary is there from the
  // first render — so this holds the LANDING (focus()'s own scroll puts it
  // wherever "in view" happens to be), not the race, which the failed send
  // above exercises through the same function.
  const { context, page } = await withMotion(browser, 1455, 900);
  try {
    await page.goto(FIXTURES);
    await hydrated(page);
    await expect(page.locator(bar)).toHaveCSS("position", "fixed");
    const summary = 'section[aria-labelledby="form-errors-heading"] [role="alert"][tabindex="-1"]';
    await expect(page.locator(summary)).toBeFocused();
    const at = await landing(page, summary);
    expect(at.focused, "the summary holds focus").toBe(true);
    expect(at.top - at.barBottom, "20px under the pinned bar").toBeGreaterThanOrEqual(19);
    expect(at.top - at.barBottom, "20px under the pinned bar").toBeLessThanOrEqual(21);
  } finally {
    await context.close();
  }
});

// ── Focus Not Obscured (WCAG 2.2 SC 2.4.11) ────────────────────────────────
//
// The two landings above are the ones SCRIPT makes. The browser makes more of
// them than script does, and the first review of this page found them all
// unguarded: native validation — this page's ONLY validation — focuses the
// first invalid control and scrolls it "into view", and every Tab and
// Shift+Tab does the same. "In view" means inside the scrollport, and nothing
// had told the scrollport that its top 80px (70 below `lg`) are under a pinned
// bar. Submitted with Name empty at 1440×900, the input took focus at top 20 /
// bottom 68: 48 of its 48px behind the bar. axe has no rule for this, so
// "wcag22aa: 0 violations" below cannot see it.
//
// Two things hold it, and each case below needs both. `html
// { scroll-padding-top }` in app.css says WHERE the scrollport's usable top is
// — for every landing the browser makes from rest, which is all the Shift+Tab
// walk asks of it. It is not enough for a submit: with the padding in place and
// the keyboard's Tab-then-Enter, the browser's focus was decided mid-glide and
// Name still ended at top 70 under the 80px bar (and a click made mid-glide
// left it at −159, off the screen). `revealInvalid` on Field's controls is what
// makes the landing the same every time: the field's LABEL 20px under the bar.
//
// BOTH motion settings, because the defect moved with them — hidden at 1440
// with the glide live, hidden at 390 with reduced motion, visible at 390 with
// the glide — and the runner's widths for a 1440 and a 390 LAYOUT (it lays out
// 15px narrower than its viewport), though nothing below reads an x.
const SIZES = [
  [1455, 900],
  [405, 664],
] as const;
const MOTIONS = ["no-preference", "reduce"] as const;
const nameInput = `${formSection} input[name="name"]`;
const nameId = (page: Page) => page.locator(nameInput).evaluate((el) => el.id);

for (const [width, height] of SIZES) {
  for (const motion of MOTIONS) {
    for (const how of ["keyboard", "mouse"] as const) {
      test(`submitted with Name empty by ${how}, the focused field is clear of the pinned bar (${width}, ${motion})`, async ({
        browser,
      }) => {
        const { context, page } = await withMotion(browser, width, height, motion);
        try {
          await page.goto(ROUTE);
          await hydrated(page);
          await expect(page.locator(bar)).toHaveCSS("position", "fixed");
          // Everything valid but Name, so Name is the control the browser picks.
          await page.getByLabel(/^Email/).fill("ada@example.com");
          await page.getByLabel(/^Message/).fill("Name was left empty on purpose.");
          if (how === "keyboard") await submitByKeyboard(page);
          else await page.getByRole("button", { name: "Send message" }).click();

          // Positive evidence that the BROWSER refused the submission and moved
          // focus itself: the field is invalid and holds focus, and neither
          // answer from the server has rendered.
          await expect(page.locator(nameInput)).toBeFocused();
          expect(await page.locator(nameInput).evaluate((el) => el.matches(":invalid"))).toBe(true);
          await expect(page.locator(`${formSection} [role="alert"]`)).toHaveCount(0);
          await expect(page.locator(`${formSection} [role="status"]`)).toHaveCount(0);

          const at = await landing(page, nameInput);
          expect(at.focused, "Name holds focus").toBe(true);
          expect(at.bottom - at.top, "the 48px control").toBe(48);
          expect(at.top, "not under the pinned bar").toBeGreaterThanOrEqual(at.barBottom);
          expect(at.bottom, "inside the viewport").toBeLessThanOrEqual(at.viewport);

          // …and asserted as a LANDING, like the alert's, because "anywhere
          // clear of the bar" is what a race passes on a lucky run: the label
          // 20px under the bar, the control under its label.
          const label = await landing(page, `${formSection} label[for="${await nameId(page)}"]`);
          expect(label.top - label.barBottom, "20px under the pinned bar").toBeGreaterThanOrEqual(
            19,
          );
          expect(label.top - label.barBottom, "20px under the pinned bar").toBeLessThanOrEqual(21);
          expect(label.bottom, "the label is above its control").toBeLessThanOrEqual(at.top);
        } finally {
          await context.close();
        }
      });
    }

    test(`Shift+Tab from the submit to the bar never parks focus under it (${width}, ${motion})`, async ({
      browser,
    }) => {
      const { context, page } = await withMotion(browser, width, height, motion);
      try {
        await page.goto(ROUTE);
        await hydrated(page);
        await expect(page.locator(bar)).toHaveCSS("position", "fixed");
        await page.getByRole("button", { name: "Send message" }).focus();
        await still(page);

        const stops: { what: string; top: number; barBottom: number }[] = [];
        let reachedBar = false;
        for (let i = 0; i < 20 && !reachedBar; i++) {
          await page.keyboard.press("Shift+Tab");
          await still(page);
          const stop = await page.evaluate((nav) => {
            const el = document.activeElement as HTMLElement;
            const barEl = document.querySelector(nav)!;
            return {
              what: el.getAttribute("name") ?? el.getAttribute("href") ?? el.tagName,
              top: el.getBoundingClientRect().top,
              barBottom: barEl.getBoundingClientRect().bottom,
              inBar: barEl.contains(el),
            };
          }, bar);
          if (stop.inBar) reachedBar = true;
          else stops.push({ what: stop.what, top: stop.top, barBottom: stop.barBottom });
        }

        // The walk is only evidence if it WALKED: through all four fields and
        // the office's two links, and out into the bar at the top.
        expect(reachedBar, "the walk ended in the bar").toBe(true);
        expect(stops.map((s) => s.what)).toEqual([
          "message",
          "phone",
          "email",
          "name",
          expect.stringMatching(/^https:\/\/www\.google\.com\/maps/),
          "tel:+12104965800",
        ]);
        expect(
          stops.filter((s) => s.top < s.barBottom),
          "focused stops under the pinned bar",
        ).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
}

for (const state of ["at rest", "after a failed send", "after the confirmation"] as const) {
  test(`/contact has no axe violations ${state}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ROUTE);
    await hydrated(page);
    if (state !== "at rest") {
      test.skip(!(await ingestIsDark(page)), "FORMS_INGEST_* are set: this would submit");
      await fillValid(page);
      if (state === "after the confirmation") {
        await page.evaluate(() => {
          document.querySelector<HTMLInputElement>('input[name="bot-field"]')!.value = "spec";
        });
      }
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(
        page.locator(
          `${formSection} [role="${state === "after the confirmation" ? "status" : "alert"}"]`,
        ),
      ).toBeVisible();
    }
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    // A rule that THROWS is not a pass (tests/a11y/fixtures.spec.ts).
    const crashed = results.incomplete.flatMap((rule) =>
      rule.nodes.flatMap((node) =>
        [...node.any, ...node.all, ...node.none]
          .filter((check) => check.id === "error-occurred")
          .map((check) => `${rule.id}: ${check.message}`),
      ),
    );
    expect(crashed, "axe rules crashed, so they measured nothing").toEqual([]);

    // Violations FIRST, reduced to what a reader needs. A node that fails
    // contrast leaves `passes`, so with the positive check ahead of this one a
    // dust paragraph (1.97:1) reported as "never measured" — true of the list
    // and false about the page. It was measured, and it failed; say that.
    expect(
      results.violations.map((v) => ({
        rule: v.id,
        nodes: v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary ?? ""}`),
      })),
    ).toEqual([]);

    // …and contrast must have measured THIS state's own text, not only the
    // chrome's: an empty `violations` cannot tell "legible" from "never looked".
    //
    // Matched on a marker that survives axe's truncation: `node.html` keeps a
    // long element's OPENING TAG only, so the alert (whose class list is long)
    // reports as `<p role="alert" …>` with none of its text. Matching its copy
    // went red on a node axe had in fact measured.
    const contrast = results.passes.find((rule) => rule.id === "color-contrast");
    const measured = (contrast?.nodes ?? []).map((n) => n.html).join("\n");
    const own = {
      "at rest": "get back to you",
      "after a failed send": 'role="alert"',
      "after the confirmation": "on its way",
    }[state];
    expect(measured, `color-contrast never measured this state's own text (${own})`).toContain(own);
  });
}
