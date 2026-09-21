import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import Nav from "./Nav.svelte";

// jsdom has no WAAPI (Element.animate), so we report reduced motion: the
// $lib/transitions wrappers then collapse durations to 0 and Svelte skips the
// animation machinery entirely. This is the same path real reduced-motion
// users hit in production.
function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

/** Move the page and tell the window, as a real scroll does. */
async function scrollTo(y: number) {
  vi.spyOn(window, "scrollY", "get").mockReturnValue(y);
  await fireEvent.scroll(window);
}

// jsdom performs no layout — treat connected elements as visible so
// trapFocus's getClientRects() filter keeps them.
beforeEach(() => {
  mockMatchMedia(true);
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return (this.isConnected ? [{}] : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

const frame = () => new Promise((r) => requestAnimationFrame(r));

/** A class list without its variant-prefixed entries (`hover:…`, `lg:…`), so
 *  "is this the element's resting colour" cannot be answered by a hover class. */
const resting = (el: Element) =>
  (el.getAttribute("class") ?? "").split(/\s+/).filter((c) => c && !c.includes(":"));

// Hash hrefs keep jsdom from attempting (unimplemented) page navigation.
const items = [
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
];

const itemsWithGroup = [
  {
    label: "Products",
    href: "",
    children: [
      { label: "Chairs", href: "#chairs" },
      { label: "Tables", href: "#tables" },
    ],
  },
  { label: "About", href: "#about" },
];

const logo = { url: "/logo.svg", reverseUrl: "/logo-reverse.svg", alt: "Roalson Interests — home" };
const cta = { label: "Contact us", href: "#contact" };

describe("Nav — the bar", () => {
  it("renders no menu button without items", () => {
    const { queryByLabelText, getByRole } = render(Nav, {});
    expect(queryByLabelText("Open menu")).toBeNull();
    expect(getByRole("navigation", { name: "Primary" })).toBeTruthy();
  });

  it("names the home link from the wordmark's alt, once", () => {
    const { getAllByRole } = render(Nav, { logo });
    const home = getAllByRole("link").filter((a) => a.getAttribute("href") === "/");
    expect(home).toHaveLength(1);
    const images = Array.from(home[0].querySelectorAll("img"));
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "/logo.svg",
      "/logo-reverse.svg",
    ]);
    // The reverse lockup is the same mark again — it must not name the link twice.
    expect(images.map((img) => img.getAttribute("alt"))).toEqual(["Roalson Interests — home", ""]);
  });

  it("renders the CTA as a link, outside the menu", () => {
    const { getByRole, queryByRole } = render(Nav, { items, logo, cta });
    expect(queryByRole("dialog")).toBeNull();
    expect(getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("#contact");
  });

  // This case used to assert `data-js-only` on the button. render() returns
  // AFTER mount, and the button exists only after mount — where app.html's
  // noscript rule can never apply — so it was checking an attribute in the one
  // state it does nothing. The server's trigger is a different element (#19);
  // Nav.premount.test.ts holds mount back to look at it.
  it("once mounted, the trigger is the button — the server's fallback link is gone", () => {
    const { getByLabelText, container } = render(Nav, { items });
    expect(getByLabelText("Open menu").tagName).toBe("BUTTON");
    expect(container.querySelector("a[data-menu-fallback]")).toBeNull();
    expect(container.querySelector('a[href="#footer-nav"]')).toBeNull();
  });
});

describe("Nav — the bar's ground", () => {
  it("is solid and pinned on a page that makes no claim", () => {
    const { getByRole, getByLabelText } = render(Nav, { items, logo, cta });
    const bar = getByRole("navigation", { name: "Primary" });
    expect(bar.hasAttribute("data-floating")).toBe(false);
    expect(resting(bar)).toEqual(expect.arrayContaining(["fixed", "bg-background"]));
    // Dust is fill-only on a light ground: 1.97:1 as a label, and as a glyph.
    expect(resting(getByLabelText("Open menu"))).toContain("text-primary");
    expect(resting(getByRole("link", { name: "Contact us" }))).toContain("text-primary");
  });

  it("floats over a dark first band: no ground, reverse wordmark, dust controls", () => {
    const { getByRole, getByLabelText } = render(Nav, { items, logo, cta, over: "dark" });
    const bar = getByRole("navigation", { name: "Primary" });
    expect(bar.hasAttribute("data-floating")).toBe(true);
    expect(resting(bar)).toContain("bg-transparent");
    expect(resting(bar)).not.toContain("bg-background");

    const [garnet, reverse] = Array.from(bar.querySelectorAll("a[href='/'] img"));
    expect(resting(garnet)).toContain("opacity-0");
    expect(resting(reverse)).not.toContain("opacity-0");

    expect(resting(getByLabelText("Open menu"))).toContain("text-dust");
    expect(resting(getByRole("link", { name: "Contact us" }))).toContain("text-dust");
  });

  it("takes its ground once the page moves, and gives it back at the top", async () => {
    const { getByRole, getByLabelText } = render(Nav, { items, logo, cta, over: "dark" });
    const bar = getByRole("navigation", { name: "Primary" });

    await scrollTo(200);
    expect(bar.hasAttribute("data-floating")).toBe(false);
    expect(resting(bar)).toContain("bg-background");
    const [garnet, reverse] = Array.from(bar.querySelectorAll("a[href='/'] img"));
    expect(resting(garnet)).not.toContain("opacity-0");
    expect(resting(reverse)).toContain("opacity-0");
    expect(resting(getByLabelText("Open menu"))).toContain("text-primary");
    expect(resting(getByLabelText("Open menu"))).not.toContain("text-dust");
    expect(resting(getByRole("link", { name: "Contact us" }))).toContain("text-primary");

    await scrollTo(0);
    expect(bar.hasAttribute("data-floating")).toBe(true);
  });

  it("reads where the page already is on mount — a reload halfway down is not at the top", () => {
    vi.spyOn(window, "scrollY", "get").mockReturnValue(900);
    const { getByRole } = render(Nav, { items, logo, over: "dark" });
    expect(getByRole("navigation", { name: "Primary" }).hasAttribute("data-floating")).toBe(false);
  });

  it("is pinned once script has mounted it", () => {
    const { getByRole } = render(Nav, { items, logo, over: "dark" });
    const bar = getByRole("navigation", { name: "Primary" });
    expect(resting(bar)).toContain("fixed");
    expect(resting(bar)).not.toContain("absolute");
  });

  it("never floats without a reverse wordmark — garnet on garnet is no wordmark", () => {
    const { getByRole } = render(Nav, { items, logo: { url: "/logo.svg" }, over: "dark" });
    const bar = getByRole("navigation", { name: "Primary" });
    expect(bar.hasAttribute("data-floating")).toBe(false);
    expect(resting(bar)).toContain("bg-background");
  });
});

// ON THE HOMEPAGE ONLY the bar has no wordmark until the hero's RI cutout has
// scrolled away (operator call 8, #18). "Scrolled away" is a position in the
// DOM — the page's `[data-nav-gate]` element reaching the bar's bottom edge —
// and not a scrollY, so these tests give jsdom a layout: a band whose top
// starts 528px down (the pinned hero's height) and moves with the page, under a
// bar pinned at the top. The numbers are the comp's: the gate is at 528 − 80 =
// 448 from `lg`, and 528 − 70 = 458 below it.
describe("Nav — the homepage's gated wordmark", () => {
  let band: HTMLElement | undefined;
  let barHeight = 80;

  /** Put a gate on the page. Without this call there is none. */
  function layOut({ bandTop = 528 } = {}) {
    band = document.createElement("div");
    band.setAttribute("data-nav-gate", "");
    document.body.append(band);
    const rect = (top: number, height: number) =>
      ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this === band) return rect(bandTop - window.scrollY, 478);
      if (this.matches('nav[aria-label="Primary"]')) return rect(0, barHeight);
      return rect(0, 0);
    });
  }

  afterEach(() => {
    band?.remove();
    band = undefined;
    barHeight = 80;
  });

  const gatedProps = { items, logo, cta, over: "dark", wordmark: "gated" } as const;

  const parts = (bar: HTMLElement) => {
    const [garnet, reverse] = Array.from(bar.querySelectorAll("a[href='/'] img"));
    return { garnet, reverse };
  };
  /** No wordmark: both lockups at opacity 0, and the reverse one marked as the
   *  image app.html's noscript rule must show. */
  const expectHeld = (bar: HTMLElement) => {
    const { garnet, reverse } = parts(bar);
    expect(resting(garnet), "garnet lockup").toContain("opacity-0");
    expect(resting(reverse), "reverse lockup").toContain("opacity-0");
    expect(reverse.getAttribute("data-nav-wordmark")).toBe("gated");
    expect(bar.hasAttribute("data-floating"), "and the bar still floats").toBe(true);
  };

  it("has no wordmark at the top of the page, on a bar that floats as usual", () => {
    layOut();
    const { getByRole, getByLabelText } = render(Nav, gatedProps);
    const bar = getByRole("navigation", { name: "Primary" });
    expectHeld(bar);
    expect(resting(bar)).toContain("bg-transparent");
    expect(resting(getByLabelText("Open menu"))).toContain("text-dust");
    expect(resting(getByRole("link", { name: "Contact us" }))).toContain("text-dust");
  });

  it("keeps the home link in the tree, named and focusable, while its wordmark is invisible", () => {
    layOut();
    const { getByRole } = render(Nav, gatedProps);
    const home = getByRole("link", { name: "Roalson Interests — home" });
    expect(home.getAttribute("href")).toBe("/");
    // Hidden with opacity and nothing else: every one of these would take the
    // link out of the tree or out of the tab order.
    for (const el of [home, ...Array.from(home.querySelectorAll("img"))]) {
      expect(el.hasAttribute("hidden")).toBe(false);
      expect(el.hasAttribute("inert")).toBe(false);
      expect(el.getAttribute("aria-hidden")).toBeNull();
      expect(resting(el)).not.toEqual(expect.arrayContaining(["hidden"]));
      expect(resting(el)).not.toEqual(expect.arrayContaining(["invisible"]));
    }
    expect(home.getAttribute("tabindex")).toBeNull();
    home.focus();
    expect(document.activeElement).toBe(home);
    // …and keyboard focus shows the wordmark: a ring around nothing says nothing.
    expect(resting(home)).toContain("group/home");
    const { reverse } = parts(getByRole("navigation", { name: "Primary" }));
    expect(reverse.getAttribute("class")).toContain("group-focus-visible/home:opacity-100");
  });

  it("floats for the whole hero — not just the 24px that re-tones every other page", async () => {
    layOut();
    const { getByRole } = render(Nav, gatedProps);
    const bar = getByRole("navigation", { name: "Primary" });
    await scrollTo(200);
    expectHeld(bar);
    await scrollTo(447);
    expectHeld(bar);
  });

  it("at the gate it takes its ground and its garnet wordmark together, and gives both back", async () => {
    layOut();
    const { getByRole, getByLabelText } = render(Nav, gatedProps);
    const bar = getByRole("navigation", { name: "Primary" });

    await scrollTo(448);
    expect(bar.hasAttribute("data-floating")).toBe(false);
    expect(resting(bar)).toContain("bg-background");
    const { garnet, reverse } = parts(bar);
    expect(resting(garnet)).not.toContain("opacity-0");
    expect(resting(reverse)).toContain("opacity-0");
    expect(reverse.hasAttribute("data-nav-wordmark")).toBe(false);
    expect(reverse.getAttribute("class")).not.toContain("group-focus-visible/home:opacity-100");
    expect(resting(getByLabelText("Open menu"))).toContain("text-primary");

    // Long past it, the band's top is far above the bar: still passed.
    await scrollTo(3000);
    expect(bar.hasAttribute("data-floating")).toBe(false);

    await scrollTo(447);
    expectHeld(bar);
  });

  it("measures the bar, not a number: a 70px bar gates at 458, and a resize re-reads it", async () => {
    layOut();
    barHeight = 70;
    const { getByRole } = render(Nav, gatedProps);
    const bar = getByRole("navigation", { name: "Primary" });
    await scrollTo(448);
    expectHeld(bar);
    await scrollTo(458);
    expect(bar.hasAttribute("data-floating")).toBe(false);

    // Back above it, then the bar grows to 80 with no scroll at all.
    await scrollTo(450);
    expectHeld(bar);
    barHeight = 80;
    await fireEvent(window, new Event("resize"));
    expect(bar.hasAttribute("data-floating")).toBe(false);
  });

  it("reads where the page already is on mount — a reload past the gate arrives with its wordmark", () => {
    layOut();
    vi.spyOn(window, "scrollY", "get").mockReturnValue(900);
    const { getByRole } = render(Nav, gatedProps);
    const bar = getByRole("navigation", { name: "Primary" });
    expect(bar.hasAttribute("data-floating")).toBe(false);
    expect(resting(parts(bar).garnet)).not.toContain("opacity-0");
  });

  it("a claim with no gate on the page is no gate: the wordmark shows and the bar re-tones at 24px", async () => {
    // No layOut(): a `home` document with no hero slice renders no band.
    const { getByRole } = render(Nav, gatedProps);
    const bar = getByRole("navigation", { name: "Primary" });
    expect(bar.hasAttribute("data-floating")).toBe(true);
    const { garnet, reverse } = parts(bar);
    expect(resting(reverse), "the reverse wordmark is showing").not.toContain("opacity-0");
    expect(reverse.hasAttribute("data-nav-wordmark")).toBe(false);

    await scrollTo(200);
    expect(bar.hasAttribute("data-floating")).toBe(false);
    expect(resting(garnet)).not.toContain("opacity-0");
  });

  it("a gate on the page is nothing without the claim — every other route keeps the bar as built", async () => {
    layOut();
    const { getByRole } = render(Nav, { items, logo, cta, over: "dark" });
    const bar = getByRole("navigation", { name: "Primary" });
    const { reverse } = parts(bar);
    expect(resting(reverse)).not.toContain("opacity-0");
    expect(reverse.hasAttribute("data-nav-wordmark")).toBe(false);
    await scrollTo(200);
    expect(bar.hasAttribute("data-floating"), "solid at 200, as on every other page").toBe(false);
  });

  it("means nothing on a bar that cannot float", () => {
    layOut();
    const { getByRole } = render(Nav, { ...gatedProps, logo: { url: "/logo.svg" } });
    const bar = getByRole("navigation", { name: "Primary" });
    expect(bar.hasAttribute("data-floating")).toBe(false);
    expect(resting(bar.querySelector("a[href='/'] img")!)).not.toContain("opacity-0");
  });

  it("follows the claim across a client navigation, with no scroll to prompt it", async () => {
    layOut();
    const { getByRole, rerender } = render(Nav, { items, logo, cta, over: "dark" });
    const bar = getByRole("navigation", { name: "Primary" });
    expect(resting(parts(bar).reverse)).not.toContain("opacity-0");

    // → the homepage
    await rerender({ wordmark: "gated", currentPath: "/" });
    expectHeld(bar);

    // → away again, scrolled to the top by the router: the wordmark is back.
    await rerender({ wordmark: undefined, currentPath: "/properties" });
    expect(resting(parts(bar).reverse)).not.toContain("opacity-0");
    expect(parts(bar).reverse.hasAttribute("data-nav-wordmark")).toBe(false);
  });

  // The case above passes with NO re-read at all — the gate's state starts at
  // "ahead", so a claim that arrives for the first time is held by default
  // (found by deleting the re-read and watching that test stay green). This is
  // the one that needs it: the bar outlives the page, and so does what it last
  // read.
  it("does not carry a gate it passed on the last visit back to the top of the homepage", async () => {
    layOut();
    const { getByRole, rerender } = render(Nav, gatedProps);
    const bar = getByRole("navigation", { name: "Primary" });
    await scrollTo(600);
    expect(bar.hasAttribute("data-floating"), "past the gate").toBe(false);

    // → /properties, which the visitor scrolls back to the top of. No claim, so
    // nothing reads a gate on the way.
    await rerender({ wordmark: undefined, currentPath: "/properties" });
    await scrollTo(0);
    // → the homepage again. Top to top: the window fires no scroll event.
    await rerender({ wordmark: "gated", currentPath: "/" });
    expectHeld(bar);
  });
});

describe("Nav — the menu", () => {
  it("opens the menu and moves focus to its Close", async () => {
    const { getByLabelText, getByRole } = render(Nav, { items, logo });

    await fireEvent.click(getByLabelText("Open menu"));
    const dialog = getByRole("dialog", { name: "Menu" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await frame();
    expect(document.activeElement).toBe(getByLabelText("Close menu"));
  });

  it("wraps Tab from the last link back to the first control", async () => {
    const { getByLabelText, getByRole } = render(Nav, { items });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    const dialog = getByRole("dialog");
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("a, button"));
    const last = focusables[focusables.length - 1];
    last.focus();

    const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(e);

    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
  });

  it("closes on Escape and returns focus to the re-mounted trigger", async () => {
    const { getByLabelText, getByRole, queryByRole } = render(Nav, { items });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    await fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();

    // The trigger unmounted while the menu was open; focus lands on the fresh
    // instance one frame after close.
    await frame();
    await frame();
    expect(document.activeElement).toBe(getByLabelText("Open menu"));
  });

  it("closes when a menu link is activated", async () => {
    const { getByLabelText, getByRole, queryByRole } = render(Nav, { items });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    const link = getByRole("link", { name: "About" });
    await fireEvent.click(link);

    expect(queryByRole("dialog")).toBeNull();
  });

  it("lists every item as a link, and marks the current page", async () => {
    const { getByLabelText, getByRole } = render(Nav, {
      items: [
        { label: "Home", href: "/" },
        { label: "Our Properties", href: "/properties" },
      ],
      currentPath: "/properties",
    });
    await fireEvent.click(getByLabelText("Open menu"));

    const dialog = getByRole("dialog");
    const links = Array.from(dialog.querySelectorAll("ul a"));
    expect(links.map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([
      ["Home", "/"],
      ["Our Properties", "/properties"],
    ]);
    // "/" is a prefix of every path — it is current only ON the home page.
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page"]);
  });

  it("locks the page behind the menu, and releases it on every close path", async () => {
    const { getByLabelText, getByRole } = render(Nav, { items });

    await fireEvent.click(getByLabelText("Open menu"));
    expect(document.body.style.overflow).toBe("hidden");
    await fireEvent.click(getByLabelText("Close menu"));
    expect(document.body.style.overflow).toBe("");

    await fireEvent.click(getByLabelText("Open menu"));
    expect(document.body.style.overflow).toBe("hidden");
    await fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
    expect(document.body.style.overflow).toBe("");

    await fireEvent.click(getByLabelText("Open menu"));
    await fireEvent.click(getByRole("link", { name: "About" }));
    expect(document.body.style.overflow).toBe("");
  });

  it("releases the lock when the component is torn down with the menu open", async () => {
    const { getByLabelText, unmount } = render(Nav, { items });
    await fireEvent.click(getByLabelText("Open menu"));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("renders duplicate labels/hrefs without crashing (index-keyed each)", async () => {
    const dupes = [
      { label: "Home", href: "#a" },
      { label: "Home", href: "#a" },
    ];
    const { getByLabelText, getByRole } = render(Nav, { items: dupes });
    await fireEvent.click(getByLabelText("Open menu"));
    expect(getByRole("dialog").querySelectorAll("ul a")).toHaveLength(2);
  });

  it("renders a group: an empty-href label as text, never a dead link, over its children", async () => {
    const { getByLabelText, getByRole } = render(Nav, { items: itemsWithGroup });
    await fireEvent.click(getByLabelText("Open menu"));

    const dialog = getByRole("dialog");
    expect(dialog.querySelector('a[href=""]')).toBeNull();
    expect(dialog.textContent).toContain("Products");
    const links = Array.from(dialog.querySelectorAll("ul a")).map((a) => a.textContent?.trim());
    expect(links).toEqual(["Chairs", "Tables", "About"]);
  });
});

describe("Nav — the trigger announces the menu's state", () => {
  // The trigger unmounts while the menu is open and the overlay renders its own
  // Close, so no single element carries a flipping aria-expanded. The contract
  // is the HANDLE: `[aria-controls]` names the dialog on both, and reads
  // false → true → false across the swap.
  it("aria-expanded flips false → true and aria-controls names the dialog", async () => {
    const { getByLabelText, getByRole, container } = render(Nav, { items });
    const handle = () =>
      container.ownerDocument.querySelector('button[aria-controls="nav-menu"]') as HTMLElement;

    expect(handle().getAttribute("aria-expanded")).toBe("false");
    const controls = handle().getAttribute("aria-controls");

    await fireEvent.click(getByLabelText("Open menu"));
    expect(getByRole("dialog").id).toBe(controls);
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(handle().getAttribute("aria-controls")).toBe(controls);

    await fireEvent.click(getByLabelText("Close menu"));
    expect(handle().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Nav — the trigger acknowledges a press", () => {
  it("sets data-pressed on pointerdown and clears it on every release path", async () => {
    const { getByLabelText } = render(Nav, { items });
    const trigger = getByLabelText("Open menu");

    for (const release of ["pointerUp", "pointerCancel", "pointerLeave", "blur"] as const) {
      await fireEvent.pointerDown(trigger);
      expect(trigger.hasAttribute("data-pressed"), `pressed before ${release}`).toBe(true);
      await fireEvent[release](trigger);
      expect(trigger.hasAttribute("data-pressed"), `cleared by ${release}`).toBe(false);
    }
  });

  it("presses the Close button independently of the trigger", async () => {
    const { getByLabelText } = render(Nav, { items });
    await fireEvent.click(getByLabelText("Open menu"));
    const close = getByLabelText("Close menu");

    await fireEvent.pointerDown(close);
    expect(close.hasAttribute("data-pressed")).toBe(true);
    await fireEvent.pointerUp(close);
    expect(close.hasAttribute("data-pressed")).toBe(false);
  });
});
