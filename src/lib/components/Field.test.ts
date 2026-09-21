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

/** The theme's colours, read from app.css (cwd-relative: under jsdom
 *  `import.meta.url` is not a file: URL — see theme-contrast.test.ts). */
const THEME: Record<string, string> = (() => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");
  const body = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6}|white|black)\s*;/gi)) {
    out[m[1]] = m[2] === "white" ? "#ffffff" : m[2] === "black" ? "#000000" : m[2];
  }
  return out;
})();

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
  it("gives the input and the textarea the SAME classes", () => {
    // They carried two copy-pasted class lists, which is exactly how a fix
    // lands on one control and not the other — the invisible border below had
    // to be changed in two places.
    const input = render(Field, { name: "a", label: "A" });
    const inputClass = input.getByLabelText("A").getAttribute("class");
    input.unmount();

    const area = render(Field, { name: "b", label: "B", type: "textarea" });
    expect(area.getByLabelText("B").getAttribute("class")).toBe(inputClass);
  });

  it("draws a resting border that clears the 3:1 non-text minimum on every light ground", () => {
    // WCAG 1.4.11 wants 3:1 for a control's boundary. The template's first
    // border was its `--color-light`, 1.20:1 on white: invisible boxes, and a
    // visitor hunting for where to type. This palette has the same trap twice
    // over — sand (`border-light`) is 1.14:1 on the off-white page and dust
    // 1.97:1 — so the border's token is MEASURED here against app.css rather
    // than named: garnet is 10.07 / 11.55 / 8.87:1.
    const { getByLabelText } = render(Field, { name: "a", label: "A" });
    const cls = getByLabelText("A").getAttribute("class") ?? "";
    const resting = cls.split(/\s+/).filter((c) => !c.includes(":"));
    const borders = resting
      .map((c) => /^border-([a-z]+)$/.exec(c)?.[1])
      .filter((token): token is string => !!token && token in THEME);
    expect(borders, "exactly one resting border colour").toHaveLength(1);
    for (const ground of ["background", "white", "light"]) {
      expect(
        contrast(THEME[borders[0]], THEME[ground]),
        `border-${borders[0]} on bg-${ground}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("is square and 1px, like the comp's only outlined control", () => {
    // The comp draws no field anywhere, so the field is `button dark`
    // (4840:368) without a label: a 1px garnet stroke, no radius, no fill.
    const { getByLabelText } = render(Field, { name: "a", label: "A" });
    const resting = (getByLabelText("A").getAttribute("class") ?? "").split(/\s+/);
    expect(resting).toContain("border");
    expect(resting.filter((c) => /^border-\d/.test(c))).toEqual([]);
    expect(resting.filter((c) => c.includes("rounded"))).toEqual([]);
    expect(resting).toContain("bg-transparent");
  });

  it("sets what is typed in Body 1 — never below 16px, or iOS Safari zooms on focus", () => {
    const { getByLabelText } = render(Field, { name: "a", label: "A" });
    const cls = (getByLabelText("A").getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toContain("t-body-1");
    expect(cls.filter((c) => /^(t-body-2|t-h[1-6]|text-(xs|sm))$/.test(c))).toEqual([]);
  });

  it("turns the focus ring to the error colour with the border, not only the border", () => {
    // Two variants on the ring so it beats `focus:ring-primary` on specificity
    // rather than on stylesheet order. tests/interaction/contact.spec.ts reads
    // the painted colour; this holds the class the cascade needs.
    const { getByLabelText } = render(Field, { name: "a", label: "A", error: "Required" });
    const cls = (getByLabelText("A").getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toContain("aria-invalid:border-error");
    expect(cls).toContain("aria-invalid:focus:ring-error");
  });

  it("spends only theme tokens — nothing from Tailwind's default palette", () => {
    // `aria-invalid:border-red-600` sat here outside the theme, so
    // theme-contrast.test.ts never measured it: red-600 is 4.77:1 on white and
    // 4.15:1 on this site's off-white. The class, enumerated on 2026-09-21:
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

  it("labels in the ramp's H6 and explains in Body 2", () => {
    const { container, getByText } = render(Field, {
      name: "a",
      label: "A",
      description: "Help",
      error: "Required",
    });
    expect(container.querySelector("label")?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["t-h6", "text-primary"]),
    );
    expect(getByText("Help").className.split(/\s+/)).toEqual(
      expect.arrayContaining(["t-body-2", "text-secondary"]),
    );
    expect(getByText("Required").className.split(/\s+/)).toEqual(
      expect.arrayContaining(["t-body-2", "text-error"]),
    );
  });

  it("keeps the forced-colors outline fallback on focus (Tailwind v4)", () => {
    // In Tailwind v4 `outline-none` resolves to `outline-style: none` and takes
    // the forced-colors fallback with it; `outline-hidden` keeps the 2px
    // transparent outline the forced-colors palette repaints. Under forced
    // colours the ring is dropped by the engine, so that outline is the only
    // focus affordance left.
    const { getByLabelText } = render(Field, { name: "a", label: "A" });
    const cls = getByLabelText("A").getAttribute("class") ?? "";
    expect(cls).toContain("focus:outline-hidden");
    expect(cls).not.toContain("focus:outline-none");
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
    // component (see "gives the input and the textarea the SAME classes").
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
