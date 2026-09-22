import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { loadSiteConfig, footerNav, type SiteConfig } from "./site-config";

describe("loadSiteConfig", () => {
  it("returns a well-formed config from the checked-in file", () => {
    const config = loadSiteConfig();
    // The shape must always be safe to hand to <Nav items> and footerNav()
    // without guards at the call site.
    expect(Array.isArray(config.nav.items)).toBe(true);
    expect(typeof config.footer).toBe("object");
  });

  // The address and phone have ONE home, $lib/office. A second copy here is how
  // a footer and a contact page come to print different ZIPs.
  it("does not carry a second copy of the office's address or phone", () => {
    const footer = loadSiteConfig().footer as Record<string, unknown>;
    expect(Object.keys(footer).sort()).toEqual(["cta", "legal", "nav", "owner"]);
    expect(JSON.stringify(footer)).not.toMatch(/Rogers Ranch|496-58/);
  });
});

describe("the checked-in footer", () => {
  const { footer } = loadSiteConfig();

  it("breaks the headline where the comp does, and orders the buttons as the comp does", () => {
    expect(footer.cta?.heading).toEqual(["We look forward", "to serving you."]);
    expect(footer.cta?.links).toEqual([
      { label: "Contact us", href: "/contact" },
      { label: "Our portfolio", href: "/properties" },
    ]);
  });

  // Prescribed wording: the Texas Real Estate Commission names these two links
  // for a broker's site. Exact strings on purpose — "tidying" a label is the
  // defect.
  // The labels are TREC's own wording and are not ours to shorten. The hrefs
  // were the client's current site until #25: they are this repo's files now,
  // and the describe block at the foot of this file holds why.
  it("labels the two TREC links exactly, and points them at documents this site serves", () => {
    expect(footer.legal).toEqual([
      {
        label: "Texas Real Estate Commission Information About Brokerage Services",
        href: "/texas-information-about-brokerage-services.pdf",
      },
      {
        label: "Texas Real Estate Commission Consumer Protection Notice",
        href: "/texas-consumer-protection-notice.pdf",
      },
    ]);
  });

  it("names the copyright holder and leaves the year to <Footer>", () => {
    expect(footer.owner).toBe("Roalson Interests");
    expect(footer.text).toBeUndefined();
  });
});

describe("footerNav", () => {
  // The comp's footer lists two pages, "Our portfolio" and "Contact us" (the
  // wordmark above them is the home link), so that is what the site's config
  // says. The first build of this footer offered the menu's three entries and
  // stood 37.91px taller than the comp at 1440; the review measured it.
  it("is the comp's two pages on this site — and still every page the dead-trigger fallback must offer", () => {
    expect(footerNav()).toEqual([
      { label: "Our portfolio", href: "/properties" },
      { label: "Contact us", href: "/contact" },
    ]);
    // Issue #19's fallback sends a visitor here when the menu cannot open:
    // every page the menu links, other than home, must be in this list.
    const menu = loadSiteConfig()
      .nav.items.map((item) => item.href)
      .filter((href) => href && href !== "/");
    expect(footerNav().map((link) => link.href)).toEqual(expect.arrayContaining(menu));
  });

  it("flattens a menu group: its own link when it has one, then its children, in order", () => {
    const config: SiteConfig = {
      nav: {
        items: [
          { label: "Home", href: "/" },
          {
            label: "Properties",
            href: "",
            children: [
              { label: "For sale", href: "/properties#for-sale" },
              { label: "Sold", href: "/properties#sold" },
            ],
          },
          { label: "About", href: "/about", children: [{ label: "Team", href: "/about/team" }] },
        ],
      },
      footer: {},
    };
    expect(footerNav(config).map((l) => l.href)).toEqual([
      "/",
      "/properties#for-sale",
      "/properties#sold",
      "/about",
      "/about/team",
    ]);
  });

  it("prefers the footer's own list when the config gives one", () => {
    const own = [
      { label: "Our portfolio", href: "/properties" },
      { label: "Contact us", href: "/contact" },
    ];
    const config: SiteConfig = {
      nav: { items: [{ label: "Home", href: "/" }] },
      footer: { nav: own },
    };
    expect(footerNav(config)).toBe(own);
  });
});

describe("the footer's legal documents — the two a Texas broker's site must carry", () => {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), "src/lib/site-config.json"), "utf8"),
  ) as SiteConfig;
  const legal = config.footer.legal ?? [];

  // They were linked at https://roalson.com/... — the CLIENT'S CURRENT SITE.
  // The day this one takes over that domain, both 404, on every page, in the
  // two links TREC requires. The files ship here instead (#25).
  it("links nothing on a domain this site is about to replace", () => {
    expect(legal.length).toBe(2);
    for (const link of legal) {
      expect(link.href, link.label).not.toMatch(/roalson\.com/i);
      expect(link.href, link.label).toMatch(/^\//);
    }
  });

  it("links a file this repository actually ships, and it is a PDF", () => {
    for (const link of legal) {
      const file = resolve(process.cwd(), "static", link.href.replace(/^\//, ""));
      expect(existsSync(file), `${link.href} is in static/`).toBe(true);
      // Positive evidence that what ships is the document, not a 404 page or an
      // HTML redirect saved with the wrong extension.
      const head = readFileSync(file).subarray(0, 5).toString("latin1");
      expect(head, link.href).toBe("%PDF-");
      expect(statSync(file).size, link.href).toBeGreaterThan(50_000);
    }
  });

  // The paths carry no year or revision number on purpose: TREC's Information
  // About Brokerage Services is reissued, and a dated path would mean editing
  // this file and every link to it. The file is replaced in place; git records
  // which revision was served when.
  it("names the documents by what they are, not by which revision they are", () => {
    for (const link of legal) expect(link.href).not.toMatch(/\d{4}|[-_]v?\d+\.pdf$/i);
  });
});
