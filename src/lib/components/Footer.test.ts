import { render, cleanup, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, it, expect, afterEach, vi } from "vitest";
import Footer from "./Footer.svelte";
import { OFFICE, officeAddressLines } from "$lib/office";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// WHAT HAPPENED TO THE TEMPLATE'S 14 TESTS
//
// The footer was rebuilt to the comp (2026-09-21) and the old suite pinned the
// template's chrome. Each test was either carried over or retired on purpose:
//
//   carried   the rights line — `owner` supplies the CURRENT year, `text` is
//             verbatim and wins (4 tests, unchanged in intent; the year
//             assertions are still computed, never literal);
//             a tel: link stays in this tab, an http(s) link opens a new one
//             with the safe rel (was asserted on `columns` rows; now on the
//             phone line and the TREC links, the only such links there are);
//             a linked logo is named by its alt.
//   inverted  "renders 'Company Name' with no props". A placeholder rights line
//             on a client's site is a wrong legal line, not a visible TODO — no
//             owner now means no line.
//   retired   `columns` (a per-route override of the whole footer: the comp
//             draws ONE footer, and the only thing a route varies is `ground`)
//             and the four `socials` tests (the comp draws none, and a row of
//             icons with no drawn position would ship undesigned the day
//             someone added a URL). BrandIcon keeps its own tests.

const CTA = {
  heading: ["We look forward", "to serving you."],
  links: [
    { label: "Contact us", href: "/contact" },
    { label: "Our portfolio", href: "/properties" },
  ],
};
const NAV = [
  { label: "Home", href: "/" },
  { label: "Our Properties", href: "/properties" },
  { label: "Contact Us", href: "/contact" },
];
/** Deliberately mixed: the site's own document and one on another origin. Both
 *  take the visitor off the page, so both open in a new tab; only the second
 *  earns a `rel`. The real config has two of the first kind since #25. */
const LEGAL = [
  {
    label: "Texas Real Estate Commission Information About Brokerage Services",
    href: "/texas-information-about-brokerage-services.pdf",
  },
  {
    label: "Texas Real Estate Commission Consumer Protection Notice",
    href: "https://roalson.com/CPN4.pdf",
  },
];

/** A link's label as a sighted visitor reads it — the sr-only hint left out. */
const visibleText = (el: Element) => {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return clone.textContent?.replace(/\s+/g, " ").trim();
};

describe("Footer — the closing call to action", () => {
  it("sets the headline as an h2, broken where the comp breaks it, reading as one sentence", () => {
    const { getByRole } = render(Footer, { cta: CTA });
    const heading = getByRole("heading", { level: 2 });
    // One <br> per drawn break — two lines, one break — and the lines
    // themselves are the config's, in order.
    expect(heading.querySelectorAll("br")).toHaveLength(CTA.heading.length - 1);
    const lines = [...heading.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      .map((n) => n.textContent?.trim());
    expect(lines).toEqual(CTA.heading);
    // The comp breaks the line with U+2028. That separator is not shipped, and
    // a reader that ignores <br> (textContent does) must not get "forwardto".
    expect(heading.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "We look forward to serving you.",
    );
    expect(heading.textContent).not.toContain("\u2028");
  });

  it("puts CONTACT US before OUR PORTFOLIO, as the comp does", () => {
    const { getByRole } = render(Footer, { cta: CTA });
    const buttons = [
      ...getByRole("heading", { level: 2 }).nextElementSibling!.querySelectorAll("a"),
    ];
    expect(buttons.map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([
      ["Contact us", "/contact"],
      ["Our portfolio", "/properties"],
    ]);
  });

  it("renders no heading at all without one", () => {
    const { queryByRole } = render(Footer, { nav: NAV });
    expect(queryByRole("heading")).toBeNull();
  });
});

describe("Footer — the list of pages", () => {
  it('is a real navigation landmark, <nav id="footer-nav" aria-label="Footer">', () => {
    const { getByRole } = render(Footer, { nav: NAV });
    const nav = getByRole("navigation", { name: "Footer" });
    // The id is a contract: the bar's menu trigger falls back to it (#19).
    expect(nav.id).toBe("footer-nav");
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([
      ["Home", "/"],
      ["Our Properties", "/properties"],
      ["Contact Us", "/contact"],
    ]);
    expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
  });

  it("marks the current page, and treats / as current only on /", () => {
    const { getByRole } = render(Footer, { nav: NAV, currentPath: "/properties" });
    const current = within(getByRole("navigation", { name: "Footer" }))
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent?.trim())).toEqual(["Our Properties"]);
  });

  it("renders no empty landmark when there is nothing to list", () => {
    const { queryByRole } = render(Footer);
    expect(queryByRole("navigation")).toBeNull();
  });
});

describe("Footer — the office", () => {
  it("prints the address from $lib/office, with the client's ZIP", () => {
    const { container } = render(Footer);
    const address = container.querySelector("address")!;
    const lines = [...address.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      .map((n) => n.textContent?.trim());
    expect(lines).toEqual(officeAddressLines());
    expect(address.querySelectorAll("br")).toHaveLength(2);
    // Lines must not run together for a reader that ignores <br>.
    expect(address.textContent?.replace(/\s+/g, " ").trim()).toBe(officeAddressLines().join(" "));
    // The comp prints "TX 7825". Five digits, or the footer is wrong on every page.
    expect(address.textContent).toContain("TX 78258");
    expect(address.textContent).not.toMatch(/\b7825\b/);
  });

  it("makes the WHOLE phone line one tel: link, in this tab", () => {
    const { container } = render(Footer);
    const tel = container.querySelector(`a[href="${OFFICE.phone.href}"]`)!;
    expect(tel.textContent?.trim()).toBe(`Phone: ${OFFICE.phone.display}`);
    // tel: stays same-tab — no target/rel.
    expect(tel.getAttribute("target")).toBeNull();
    expect(tel.getAttribute("rel")).toBeNull();
    // Hidden in every frame of the comp.
    expect(container.textContent).not.toContain("Fax");
  });
});

describe("Footer — the Texas Real Estate Commission links", () => {
  it("labels them exactly as given, and opens both documents in a new tab", () => {
    const { container } = render(Footer, { legal: LEGAL });
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')];
    expect(links.map(visibleText)).toEqual(LEGAL.map((l) => l.label));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(LEGAL.map((l) => l.href));
    for (const a of links) {
      expect(a.className).toContain("underline");
      expect(a.querySelector(".sr-only")?.textContent).toContain("opens in a new tab");
    }
    // The rel is the cross-origin one's alone: a document of ours opens no
    // window on another site, and `noopener` is implied by target anyway.
    expect(links[0].getAttribute("rel")).toBeNull();
    expect(links[1].getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps the label's text directly in the link, where the underline reaches it", () => {
    // app.css makes every <span> an inline-block, and an underline does not
    // propagate into one: a label wrapped in a span loses its underline.
    const { container } = render(Footer, { legal: LEGAL });
    const link = container.querySelector('a[target="_blank"]')!;
    const ownText = [...link.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    expect(ownText).toBe(LEGAL[0].label);
  });

  // What the rule turns on is whether the visitor LEAVES, not where the file
  // lives. #25 moved the two PDFs onto this origin, and an origin test alone
  // would have swapped their tab silently on the way.
  it("a page of this site stays in this tab; a document of this site does not", () => {
    const { container } = render(Footer, {
      legal: [
        { label: "Accessibility", href: "/accessibility" },
        { label: "Consumer Protection Notice", href: "/docs/cpn.pdf" },
      ],
    });
    const page = container.querySelector('a[href="/accessibility"]')!;
    expect(page.getAttribute("target")).toBeNull();
    expect(page.querySelector(".sr-only")).toBeNull();

    const doc = container.querySelector('a[href="/docs/cpn.pdf"]')!;
    expect(doc.getAttribute("target")).toBe("_blank");
    expect(doc.getAttribute("rel")).toBeNull();
    expect(doc.querySelector(".sr-only")?.textContent).toContain("opens in a new tab");
  });
});

describe("Footer — the wordmark", () => {
  it("links home and is named by the image's alt", () => {
    const { getByRole } = render(Footer, { logo: { url: "/logo.svg" } });
    const home = getByRole("link", { name: "Roalson Interests" });
    expect(home.getAttribute("href")).toBe("/");
    const img = home.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/logo.svg");
    // The file's own box, so the row is reserved before the image arrives.
    expect([img.getAttribute("width"), img.getAttribute("height")]).toEqual(["383", "123"]);
  });

  it("takes the config's alt when it has one", () => {
    const { getByRole } = render(Footer, { logo: { url: "/logo.svg", alt: "Roalson home" } });
    expect(getByRole("link", { name: "Roalson home" })).toBeTruthy();
  });
});

describe("Footer — the ground", () => {
  const GRADIENT = ["lg:bg-gradient-to-b", "lg:from-background", "lg:to-light"];

  it("is flat sand unless a route asks otherwise", () => {
    const { container } = render(Footer);
    const classes = [...container.querySelector("footer")!.classList];
    expect(classes).toContain("bg-light");
    expect(classes.filter((c) => /gradient|from-|to-/.test(c))).toEqual([]);
  });

  it('"fade" grades off-white to sand from lg ONLY — the comp\'s 390 homepage is flat', () => {
    const { container } = render(Footer, { ground: "fade" });
    const classes = [...container.querySelector("footer")!.classList];
    expect(classes).toEqual(expect.arrayContaining(["bg-light", ...GRADIENT]));
    // Every gradient class carries the breakpoint; a bare one would grade mobile.
    expect(classes.filter((c) => /gradient|from-|to-/.test(c)).sort()).toEqual(
      [...GRADIENT].sort(),
    );
  });
});

describe("Footer — its duties to the pinned photo band", () => {
  it("paints over what it slides across: relative, z-10", () => {
    const { container } = render(Footer);
    const classes = [...container.querySelector("footer")!.classList];
    expect(classes).toEqual(expect.arrayContaining(["relative", "z-10"]));
  });

  it("publishes its border-box height as --footer-h on <html>, and takes it back", async () => {
    type Callback = (entries: Partial<ResizeObserverEntry>[]) => void;
    const observed: Element[] = [];
    let fire: Callback = () => {};
    let disconnected = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: Callback) {
          fire = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {
          disconnected += 1;
        }
      },
    );
    const root = document.documentElement;

    const { container, unmount } = render(Footer);
    await tick();
    const footer = container.querySelector("footer")!;
    expect(observed, "it measures ITSELF").toEqual([footer]);
    // jsdom lays nothing out, so the first write is the rect's 0 — what matters
    // is that the property exists before the observer's first callback.
    expect(root.style.getPropertyValue("--footer-h")).toBe("0px");

    // The observer's number wins, fractional: the band is 512.56 at 1440.
    fire([{ borderBoxSize: [{ blockSize: 512.5625, inlineSize: 1440 }] }]);
    expect(root.style.getPropertyValue("--footer-h")).toBe("512.56px");
    fire([{ borderBoxSize: [{ blockSize: 1036.5625, inlineSize: 390 }] }]);
    expect(root.style.getPropertyValue("--footer-h")).toBe("1036.56px");

    unmount();
    expect(disconnected).toBe(1);
    expect(root.style.getPropertyValue("--footer-h")).toBe("");
  });

  it("still publishes a height where ResizeObserver does not exist", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { unmount } = render(Footer);
    await tick();
    expect(document.documentElement.style.getPropertyValue("--footer-h")).toBe("0px");
    unmount();
  });
});

describe("Footer — the rights line", () => {
  // --- `owner` vs `text`: the copyright year must not be able to go stale ---
  //
  // `text` is a verbatim override, so a site that spells its whole rights line
  // there freezes whatever year it typed — correct in the January it was
  // written, wrong every January after. `owner` exists so the common case
  // ("© <year> <someone>") keeps the year at render time. The year assertions
  // below are computed, never literal: a hardcoded year in the component would
  // pass a literal expectation for one year and then start failing silently in
  // a repo nobody is looking at.

  it("owner renders the CURRENT year, not a frozen one", () => {
    const { container } = render(Footer, { owner: "Roalson Interests" });
    const year = new Date().getFullYear();
    expect(container.textContent).toContain(`© ${year} Roalson Interests`);
  });

  it("renders the supplied rights line verbatim", () => {
    const text = "© Composition Hospitality 2017, All Rights Reserved";
    const { container } = render(Footer, { text });
    expect(container.textContent).toContain(text);
  });

  it("text still wins over owner, for a line that is not © year name", () => {
    const { container } = render(Footer, {
      owner: "Roalson Interests",
      text: "© Composition Hospitality 2017, All Rights Reserved",
    });
    expect(container.textContent).toContain("2017, All Rights Reserved");
    expect(container.textContent).not.toContain("Roalson Interests");
  });

  it("with no owner and no text there is NO rights line — never a placeholder", () => {
    const { container } = render(Footer, { cta: CTA, nav: NAV, legal: LEGAL });
    expect(container.querySelector("footer")).not.toBeNull();
    expect(container.textContent).not.toContain("©");
    expect(container.textContent).not.toContain("Company Name");
  });
});
