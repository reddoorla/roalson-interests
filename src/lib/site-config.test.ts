import { describe, it, expect } from "vitest";
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
  it("labels the two TREC links exactly, and points them at the file's own hyperlinks", () => {
    expect(footer.legal).toEqual([
      {
        label: "Texas Real Estate Commission Information About Brokerage Services",
        href: "https://roalson.com/IABS%20Roalson%20Form%202026.pdf",
      },
      {
        label: "Texas Real Estate Commission Consumer Protection Notice",
        href: "https://roalson.com/CPN4.pdf",
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
