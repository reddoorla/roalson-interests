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
    expect(Object.keys(footer).sort()).toEqual(["cta", "legal", "owner"]);
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
  it("is the menu's own list on this site — the pages the dead-trigger fallback must offer", () => {
    expect(footerNav()).toEqual([
      { label: "Home", href: "/" },
      { label: "Our Properties", href: "/properties" },
      { label: "Contact Us", href: "/contact" },
    ]);
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
