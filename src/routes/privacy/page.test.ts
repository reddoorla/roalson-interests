import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import PrivacyPage from "./+page.svelte";
import type { PrivacyServices } from "$lib/privacy/services";

afterEach(() => cleanup());

const NONE: PrivacyServices = {
  forms: false,
  ga4: false,
  netlify: false,
  vimeo: false,
  youtube: false,
  googleFonts: false,
  adobeFonts: false,
  newsletter: false,
  turnstile: false,
};

const page = (services: Partial<PrivacyServices> = {}, values: Record<string, string> = {}) =>
  render(PrivacyPage, {
    props: {
      data: {
        privacy: {
          legalName: "Roalson Interests, LLC",
          contactEmail: "privacy@example.com",
          effectiveDate: "2026-10-04",
          draft: true,
          services: { ...NONE, ...services },
          ...values,
        },
      },
    } as never,
  });

const text = (c: HTMLElement) => c.textContent?.replace(/\s+/g, " ") ?? "";

describe("the privacy page", () => {
  it("renders the per-site values", () => {
    const { container } = page();
    expect(text(container)).toContain("Roalson Interests, LLC");
    expect(text(container)).toContain("October 4, 2026");
    const mail = container.querySelector('a[href="mailto:privacy@example.com"]');
    expect(mail?.textContent).toContain("privacy@example.com");
  });

  it("shows a visible placeholder for every value a site has not filled", () => {
    const { container } = page({}, { legalName: "", contactEmail: "", effectiveDate: "" });
    expect(text(container)).toContain("[client legal name]");
    expect(text(container)).toContain("[privacy contact email]");
    expect(text(container)).toContain("[effective date]");
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("is marked DRAFT while legal review is outstanding", () => {
    const { getByTestId } = page();
    expect(getByTestId("privacy-draft").textContent).toMatch(/DRAFT/);
  });

  it("drops the DRAFT notice only when the flag is cleared", () => {
    const { queryByTestId } = render(PrivacyPage, {
      props: {
        data: {
          privacy: {
            legalName: "X",
            contactEmail: "a@b.co",
            effectiveDate: "2026-10-04",
            draft: false,
            services: NONE,
          },
        },
      } as never,
    });
    expect(queryByTestId("privacy-draft")).toBeNull();
  });

  it("says how the site answers Do Not Track", () => {
    const { getByTestId } = page({ ga4: true });
    const dnt = getByTestId("privacy-dnt");
    expect(dnt.querySelector("h2")?.textContent).toBe("Do Not Track");
    expect(text(dnt)).toMatch(/does not change what it collects/);
  });

  it("describes GA4 only on a site with a measurement ID", () => {
    expect(page().queryByTestId("service-ga4")).toBeNull();
    cleanup();
    expect(text(page().container)).not.toMatch(/Google Analytics/);
    cleanup();
    const on = page({ ga4: true });
    expect(text(on.getByTestId("service-ga4"))).toMatch(/Google Analytics/);
    expect(text(on.getByTestId("service-ga4"))).toMatch(/across different websites/);
  });

  it("renders exactly the services that are switched on", () => {
    const ids = [
      "forms",
      "turnstile",
      "newsletter",
      "ga4",
      "googleFonts",
      "adobeFonts",
      "vimeo",
      "youtube",
      "netlify",
    ] as const;
    for (const id of ids) {
      const { container } = page({ [id]: true });
      const shown = [...container.querySelectorAll("[data-testid^='service-']")].map((el) =>
        el.getAttribute("data-testid"),
      );
      expect(shown).toEqual([`service-${id}`]);
      cleanup();
    }
  });

  it("names the form fields only on a site with a form", () => {
    expect(text(page().container)).not.toMatch(/phone number/);
    cleanup();
    expect(text(page({ forms: true }).container)).toMatch(/phone number/);
  });

  it("answers whether others track visitors across sites, whatever is switched on", () => {
    expect(text(page().getByTestId("privacy-tracking"))).toMatch(/No other party/);
    cleanup();
    for (const id of [
      "forms",
      "ga4",
      "vimeo",
      "youtube",
      "googleFonts",
      "adobeFonts",
      "turnstile",
    ]) {
      expect(text(page({ [id]: true }).getByTestId("privacy-tracking")), id).toMatch(
        /may collect information about your online activities over time/,
      );
      cleanup();
    }
  });

  it("says personal information is not sold", () => {
    expect(text(page().container)).toMatch(/do not sell/);
  });
});

describe("the form paragraph's IP sentence", () => {
  it("names the real-browser check only when Turnstile is on", () => {
    expect(text(page({ forms: true }).container)).not.toMatch(/confirm the form came from a real/);
    cleanup();
    expect(text(page({ forms: true, turnstile: true }).container)).toMatch(
      /confirm the form came from a real browser/,
    );
  });

  it("discloses the cross-site spam comparison with the forms recipient", () => {
    expect(text(page({ forms: true }).getByTestId("service-forms"))).toMatch(
      /compares your email address and message with messages sent through those websites/,
    );
  });
});
