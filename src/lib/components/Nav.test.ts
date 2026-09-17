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
});

const frame = () => new Promise((r) => requestAnimationFrame(r));

// Hash hrefs keep jsdom from attempting (unimplemented) page navigation.
const items = [
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
];

// A top item with dropdown children (renders as a desktop dropdown / mobile
// accordion).
const itemsWithDropdown = [
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

// Flat `navLinks` — a per-route override of the site-config nav. These take
// precedence over `items` and render the focus-trapped mobile menu below.
const navLinks = [
  { text: "Services", href: "#services" },
  { text: "About", href: "#about" },
];

describe("Nav — logo-only mode", () => {
  it("renders no menu button without items", () => {
    const { queryByLabelText, getByText } = render(Nav);
    expect(getByText("Logo")).toBeTruthy();
    expect(queryByLabelText("Open menu")).toBeNull();
  });

  it("renders the resolved logo image when given a logo", () => {
    const { getByAltText } = render(Nav, {
      logo: { url: "https://cdn.example/logo.png", maxWidth: "250px" },
    });
    const img = getByAltText("Home") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.example/logo.png");
    expect(img.style.maxWidth).toBe("250px");
  });
});

describe("Nav — mobile menu", () => {
  it("opens the menu and moves focus into it", async () => {
    const { getByLabelText, getByRole } = render(Nav, { items });

    await fireEvent.click(getByLabelText("Open menu"));
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await frame();
    expect(document.activeElement).toBe(getByLabelText("Close menu"));
  });

  it("wraps Tab from the last link back to the close button", async () => {
    const { getByLabelText, getByRole } = render(Nav, { items });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    const dialog = getByRole("dialog");
    const links = Array.from(dialog.querySelectorAll("a"));
    const last = links[links.length - 1];
    last.focus();

    const e = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    last.dispatchEvent(e);

    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(getByLabelText("Close menu"));
  });

  it("closes on Escape and returns focus to the re-mounted trigger", async () => {
    const { getByLabelText, getByRole, queryByRole } = render(Nav, {
      items,
    });
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
    const { getByLabelText, getByRole, queryByRole } = render(Nav, {
      items,
    });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    const link = Array.from(getByRole("dialog").querySelectorAll("a"))[0];
    await fireEvent.click(link);

    expect(queryByRole("dialog")).toBeNull();
  });

  it("renders duplicate labels/hrefs without crashing (index-keyed each)", () => {
    // Two children pointing at the same href, and repeated top-level labels —
    // both would throw each_key_duplicate at hydration if keyed by label/href.
    const dupes = [
      {
        label: "Company",
        href: "",
        children: [
          { label: "About", href: "/contact" },
          { label: "Team", href: "/contact" },
        ],
      },
      { label: "Company", href: "/company" },
    ];
    expect(() => render(Nav, { items: dupes })).not.toThrow();
  });

  it("renders an empty-href item as non-interactive text, not a dead link", () => {
    const { container, getByText } = render(Nav, {
      items: [{ label: "Heading", href: "" }],
    });
    expect(getByText("Heading").tagName).toBe("SPAN");
    // The only <a> is the logo home link; no <a href=""> leaf.
    const emptyLinks = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.getAttribute("href") === "",
    );
    expect(emptyLinks).toHaveLength(0);
  });

  it("desktop dropdown is a disclosure: aria-expanded toggles, Escape closes", async () => {
    const { container } = render(Nav, { items: itemsWithDropdown });
    // Scoped to the dropdown's own id prefix: the menu trigger carries
    // aria-controls too (it points at the overlay — see the aria-state suite
    // below), so a bare `button[aria-controls]` no longer names one button.
    const toggle = container.querySelector(
      'button[aria-controls^="nav-dropdown-"]',
    ) as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    // No misleading aria-haspopup (the popup is a list of links, not a menu).
    expect(toggle.getAttribute("aria-haspopup")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await fireEvent.keyDown(toggle, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("expands a dropdown as an accordion and reveals its children", async () => {
    const { getByLabelText, getByRole } = render(Nav, {
      items: itemsWithDropdown,
    });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    // Scope to the dialog: the desktop dropdown <ul> also holds these links and
    // jsdom applies no stylesheet, so Tailwind's `hidden`/`lg:flex` doesn't hide
    // it — only the dialog's accordion actually collapses its children.
    const dialog = getByRole("dialog");
    expect(dialog.textContent).not.toContain("Chairs");

    const toggle = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Products"),
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.textContent).toContain("Chairs");
    expect(dialog.textContent).toContain("Tables");
  });
});

// The flat-links chrome a route renders when it passes a `navLinks` prop
// override. Distinct code path from the `items` dropdown nav above.
describe("Nav — navLinks (per-route override) mode", () => {
  it("opens the menu and moves focus into it", async () => {
    const { getByLabelText, getByRole } = render(Nav, { navLinks });

    await fireEvent.click(getByLabelText("Open menu"));
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await frame();
    expect(document.activeElement).toBe(getByLabelText("Close menu"));
  });

  it("wraps Tab from the last link back to the close button", async () => {
    const { getByLabelText, getByRole } = render(Nav, { navLinks });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    const dialog = getByRole("dialog");
    const links = Array.from(dialog.querySelectorAll("a"));
    const last = links[links.length - 1];
    last.focus();

    const e = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    last.dispatchEvent(e);

    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(getByLabelText("Close menu"));
  });

  it("closes on Escape and returns focus to the re-mounted trigger", async () => {
    const { getByLabelText, getByRole, queryByRole } = render(Nav, {
      navLinks,
    });
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
    const { getByLabelText, getByRole, queryByRole } = render(Nav, {
      navLinks,
    });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    const link = Array.from(getByRole("dialog").querySelectorAll("a"))[0];
    await fireEvent.click(link);

    expect(queryByRole("dialog")).toBeNull();
  });
});

// The trigger unmounts while the menu is open and the overlay renders its own
// Close in the same slot, so no single element can carry a flipping
// aria-expanded. Both buttons carry the pair instead, pointing at the dialog's
// id — which is what makes `[aria-controls="nav-menu"]` a stable handle whose
// aria-expanded reads false → true across the swap.
describe("Nav — the trigger announces the menu's state", () => {
  const MENU_ID = "nav-menu";
  const stateButton = () =>
    document.body.querySelector(`button[aria-controls="${MENU_ID}"]`) as HTMLButtonElement;

  for (const [mode, props] of [
    ["site-config items", { items }],
    ["page-data navLinks", { navLinks }],
  ] as const) {
    it(`(${mode}) aria-expanded flips false → true and aria-controls names the dialog`, async () => {
      const { getByLabelText, getByRole } = render(Nav, props);

      const trigger = getByLabelText("Open menu");
      expect(trigger.getAttribute("aria-controls")).toBe(MENU_ID);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");

      await fireEvent.click(trigger);
      await frame();

      // The id the trigger pointed at is the dialog that actually mounted — a
      // dangling aria-controls is worse than none.
      const dialog = getByRole("dialog");
      expect(dialog.id).toBe(MENU_ID);

      // Same handle, now the Close button, now expanded.
      const open = stateButton();
      expect(open.getAttribute("aria-label")).toBe("Close menu");
      expect(open.getAttribute("aria-expanded")).toBe("true");

      await fireEvent.click(open);
      await frame();
      await frame();
      expect(stateButton().getAttribute("aria-expanded")).toBe("false");
    });
  }
});

// A tap that looks like nothing happened gets tapped again — and the second tap
// lands after the overlay has mounted, closing it. `hover:` compiles behind
// `@media (hover: hover)`, so a phone got no feedback at all, and `:active`
// alone is not enough either: a real dispatched touchStart leaves
// `matches(":active")` false in Chromium. So the press is driven by POINTER
// events and surfaced as `data-pressed`, which the glyph's classes key off.
describe("Nav — the trigger acknowledges a press", () => {
  it("sets data-pressed on pointerdown and clears it on every release path", async () => {
    const { getByLabelText } = render(Nav, { items });
    const trigger = getByLabelText("Open menu");
    expect(trigger.hasAttribute("data-pressed")).toBe(false);

    // A finger that slides off the control, a drag the browser turns into a
    // scroll, and a blur must all leave the press state clean — otherwise the
    // affordance sticks on and the control looks permanently held.
    for (const release of ["pointerUp", "pointerCancel", "pointerLeave", "blur"] as const) {
      await fireEvent.pointerDown(trigger);
      expect(trigger.hasAttribute("data-pressed"), `pressed before ${release}`).toBe(true);
      await fireEvent[release](trigger);
      expect(trigger.hasAttribute("data-pressed"), `released on ${release}`).toBe(false);
    }
  });

  it("presses the Close button independently of the trigger", async () => {
    const { getByLabelText } = render(Nav, { items });
    await fireEvent.click(getByLabelText("Open menu"));
    await frame();

    const close = getByLabelText("Close menu");
    await fireEvent.pointerDown(close);
    expect(close.hasAttribute("data-pressed")).toBe(true);
    await fireEvent.pointerUp(close);
    expect(close.hasAttribute("data-pressed")).toBe(false);
  });
});
