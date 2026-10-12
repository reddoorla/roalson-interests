import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Field from "./Field.svelte";

afterEach(() => cleanup());

/** Tailwind's default palette, as a class fragment: `red-600`, `green-50`.
 *  None of it is in this site's theme, so none of it is ever measured. */
const DEFAULT_PALETTE =
  /\b(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

/** app.css, cwd-relative: under jsdom `import.meta.url` is not a file: URL —
 *  see theme-contrast.test.ts. */
const CSS = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

/** app.css's `@theme` block. */
const THEME_BODY = /@theme\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";

/** The theme's colours, read from app.css. */
const THEME: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const m of THEME_BODY.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6}|white|black)\s*;/gi)) {
    out[m[1]] = m[2] === "white" ? "#ffffff" : m[2] === "black" ? "#000000" : m[2];
  }
  return out;
})();

/** A CSS length in px; a rem is the root's 16px. */
const toPx = (value: string, unit: string) => Number(value) * (unit === "rem" ? 16 : 1);

/** Font sizes in px by class: Tailwind's named `text-*` scale (rem), as app.css's
 *  `@theme` may override it, and the type ramp's `@utility t-*` blocks. */
const RAMP: Record<string, number> = {
  ...Object.fromEntries(
    Object.entries({
      xs: 0.75,
      sm: 0.875,
      base: 1,
      lg: 1.125,
      xl: 1.25,
      "2xl": 1.5,
      "3xl": 1.875,
      "4xl": 2.25,
      "5xl": 3,
      "6xl": 3.75,
      "7xl": 4.5,
      "8xl": 6,
      "9xl": 8,
    }).map(([name, rem]) => [`text-${name}`, rem * 16]),
  ),
  ...Object.fromEntries(
    [...THEME_BODY.matchAll(/--text-([a-z0-9]+):\s*([\d.]+)(px|rem)\s*;/g)].map((m) => [
      `text-${m[1]}`,
      toPx(m[2], m[3]),
    ]),
  ),
  ...Object.fromEntries(
    [...CSS.matchAll(/@utility (t-[a-z0-9-]+)\s*\{[^}]*?font-size:\s*([\d.]+)(px|rem)/g)].map(
      (m) => [m[1], toPx(m[2], m[3])],
    ),
  ),
};

/** The font size a resting class sets, in px: a named size (its `/leading`
 *  modifier dropped) or an arbitrary `text-[16px]` / `text-[1rem]`. */
const fontSize = (cls: string): number | undefined => {
  const arbitrary = /^text-\[([\d.]+)(px|rem)\]$/.exec(cls);
  return arbitrary ? toPx(arbitrary[1], arbitrary[2]) : RAMP[cls.replace(/\/[^/]+$/, "")];
};

/** WCAG 2.x contrast between two #rrggbb values. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("Field", () => {
  it("renders a label associated with the input", () => {
    const { getByLabelText } = render(Field, { name: "email", label: "Email" });
    const input = getByLabelText("Email") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.tagName).toBe("INPUT");
    expect(input.name).toBe("email");
  });

  it("marks required fields with aria + visible indicator", () => {
    const { getByLabelText, getByText } = render(Field, {
      name: "email",
      label: "Email",
      required: true,
    });
    const input = getByLabelText(/Email/) as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(getByText("(required)")).toBeTruthy();
  });

  it("links description via aria-describedby", () => {
    const { getByLabelText, getByText } = render(Field, {
      name: "email",
      label: "Email",
      description: "We never share it.",
    });
    const input = getByLabelText("Email") as HTMLInputElement;
    const description = getByText("We never share it.");
    expect(input.getAttribute("aria-describedby")).toContain(description.id);
  });

  it("links error via aria-describedby and sets aria-invalid", () => {
    const { getByLabelText, getByRole } = render(Field, {
      name: "email",
      label: "Email",
      error: "Required",
    });
    const input = getByLabelText("Email") as HTMLInputElement;
    const alert = getByRole("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(alert.textContent).toBe("Required");
  });

  it("renders a textarea when type=textarea", () => {
    const { getByLabelText } = render(Field, {
      name: "msg",
      label: "Message",
      type: "textarea",
    });
    const textarea = getByLabelText("Message") as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
  });
});

// The control's skin, which had two defects a class list cannot show you.
describe("Field styling", () => {
  it("draws a resting border that clears the 3:1 non-text minimum on every light ground", () => {
    // WCAG 1.4.11 wants 3:1 for a control's boundary. The template's first
    // border was its `--color-light`, 1.20:1 on white: invisible boxes, and a
    // visitor hunting for where to type. This palette has the same trap twice
    // over — sand (`border-light`) is 1.09:1 on the off-white page and dust
    // 2.01:1 — so the border's token is MEASURED here against app.css rather
    // than named: garnet is 10.25 / 11.55 / 9.38:1.
    for (const type of ["text", "textarea"] as const) {
      const { getByLabelText, unmount } = render(Field, { name: "a", label: "A", type });
      const cls = getByLabelText("A").getAttribute("class") ?? "";
      unmount();
      const resting = cls.split(/\s+/).filter((c) => !c.includes(":"));
      const borders = resting
        .map((c) => /^border-([a-z]+)$/.exec(c)?.[1])
        .filter((token): token is string => !!token && token in THEME);
      expect(borders, `exactly one resting border colour on the ${type}`).toHaveLength(1);
      for (const ground of ["background", "white", "light"]) {
        expect(
          contrast(THEME[borders[0]], THEME[ground]),
          `${type}: border-${borders[0]} on bg-${ground}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("sets what is typed at 16px or more, or iOS Safari zooms on focus", () => {
    for (const type of ["text", "textarea"] as const) {
      const { getByLabelText, unmount } = render(Field, { name: "a", label: "A", type });
      const resting = (getByLabelText("A").getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((c) => !c.includes(":"));
      unmount();
      const sizes = resting.flatMap((c) => fontSize(c) ?? []);
      expect(sizes, `the ${type}'s resting type size`).not.toEqual([]);
      for (const px of sizes) expect(px, type).toBeGreaterThanOrEqual(16);
    }
  });

  it("spends only theme tokens — nothing from Tailwind's default palette", () => {
    // The invalid border was Tailwind's default red 600, outside the theme, so
    // theme-contrast.test.ts never measured it: 4.77:1 on white and 4.15:1 on
    // this site's off-white. (Not written out as a utility: Tailwind's source
    // scan reads this file.) The class, enumerated on 2026-09-21:
    // this, Form.svelte's summary (×3) and the contact page's two panels (×6).
    const { container } = render(Field, {
      name: "a",
      label: "A",
      required: true,
      description: "Help",
      error: "Required",
    });
    expect(container.innerHTML).not.toMatch(DEFAULT_PALETTE);
    cleanup();
    const area = render(Field, { name: "b", label: "B", type: "textarea", error: "Required" });
    expect(area.container.innerHTML).not.toMatch(DEFAULT_PALETTE);
  });

  it("keeps the forced-colors outline fallback on focus (Tailwind v4)", () => {
    // In Tailwind v4 `outline-none` resolves to `outline-style: none` and takes
    // the forced-colors fallback with it; `outline-hidden` keeps the 2px
    // transparent outline the forced-colors palette repaints. Under forced
    // colours the ring is dropped by the engine, so that outline is the only
    // focus affordance left.
    const { getByLabelText } = render(Field, { name: "a", label: "A" });
    const cls = (getByLabelText("A").getAttribute("class") ?? "").split(/\s+/);
    expect(cls.filter((c) => /(^|:)outline-none$/.test(c))).toEqual([]);
  });
});

// Modal.svelte finds its initial-focus target by `[autofocus]`; with none, the
// native dialog-focusing steps land on the first focusable child, which is the
// ✕ — the exit. Opt-in, and off by default so no page ever grabs focus on load
// by accident.
describe("Field autofocus", () => {
  it("carries no autofocus attribute unless asked", () => {
    const { getByLabelText } = render(Field, { name: "email", label: "Email" });
    expect((getByLabelText("Email") as HTMLInputElement).hasAttribute("autofocus")).toBe(false);
  });

  it("marks the control as the dialog's focus target when autofocus is set", () => {
    const { getByLabelText } = render(Field, {
      name: "name",
      label: "Name",
      autofocus: true,
    });
    expect((getByLabelText("Name") as HTMLInputElement).hasAttribute("autofocus")).toBe(true);
  });

  it("applies to the textarea as well as the input", () => {
    // The two controls are a standing source of one-sided fixes in this
    // component.
    const { getByLabelText } = render(Field, {
      name: "msg",
      label: "Message",
      type: "textarea",
      autofocus: true,
    });
    expect((getByLabelText("Message") as HTMLTextAreaElement).hasAttribute("autofocus")).toBe(true);
  });
});

describe("Field under native validation", () => {
  // The browser's focus on the control it refuses can end under the pinned bar
  // ($lib/utils/reveal has the race and the measurement). Held here: that BOTH
  // controls wear the handler, and that what lands is the LABEL — the input's
  // own landing would put its label behind the bar. Where it lands is
  // tests/interaction/contact.spec.ts's.
  type Scroll = (arg?: boolean | ScrollIntoViewOptions) => void;
  const proto = Element.prototype as { scrollIntoView?: Scroll };

  afterEach(() => {
    delete proto.scrollIntoView;
    vi.restoreAllMocks();
  });

  for (const type of ["text", "textarea"] as const) {
    it(`lands a refused ${type === "textarea" ? "textarea" : "input"} by its label, once it holds focus`, () => {
      const scrolls: [Element, unknown][] = [];
      proto.scrollIntoView = function (this: Element, arg) {
        scrolls.push([this, arg]);
      };
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));

      const { getByLabelText, container } = render(Field, {
        name: "name",
        label: "Name",
        type,
        required: true,
      });
      const control = getByLabelText(/^Name/) as HTMLInputElement | HTMLTextAreaElement;

      // What interactive validation does: `invalid`, then focus.
      expect(control.checkValidity()).toBe(false);
      control.focus();
      frames.splice(0).forEach((cb) => cb(0));

      expect(scrolls).toEqual([[container.querySelector("label"), { block: "start" }]]);
    });
  }
});
