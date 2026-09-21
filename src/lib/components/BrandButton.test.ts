import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { createRawSnippet } from "svelte";

import BrandButton, {
  BRAND_BUTTON_TONES,
  brandButtonBase,
  brandButtonPadding,
} from "./BrandButton.svelte";

afterEach(cleanup);

const label = createRawSnippet(() => ({ render: () => "<span>Learn more</span>" }));

describe("BrandButton", () => {
  it("is a link with the comp's geometry: 40px tall, square, 1px border", () => {
    const { getByRole } = render(BrandButton, { props: { href: "/properties", children: label } });
    const a = getByRole("link", { name: "Learn more" });
    expect(a.getAttribute("href")).toBe("/properties");
    expect(a.className).toMatch(/\bh-10\b/);
    expect(a.className).toMatch(/\bborder\b/);
    expect(a.className).not.toMatch(/rounded/);
  });

  it("drops the right padding 15 → 10px only when the arrow is there", () => {
    const plain = render(BrandButton, { props: { href: "/x", children: label } });
    expect(plain.getByRole("link").className).toMatch(/(^|\s)px-\[15px\](\s|$)/);
    cleanup();
    const arrowed = render(BrandButton, { props: { href: "/x", arrow: true, children: label } });
    const a = arrowed.getByRole("link");
    expect(a.className).toMatch(/(^|\s)pr-\[10px\](\s|$)/);
    expect(a.className).not.toMatch(/px-\[15px\]/);
    expect(a.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("swaps garnet for off-white on the cream tone: rest colours never mix, hover inverts", () => {
    // Unprefixed utilities are the rest state; `hover:` ones are the fill.
    const rest = (el: Element) => el.className.split(/\s+/).filter((c) => !c.includes(":"));
    const garnet = render(BrandButton, { props: { href: "/x", children: label } });
    expect(rest(garnet.getByRole("link"))).toEqual(
      expect.arrayContaining(["border-primary", "text-primary"]),
    );
    expect(rest(garnet.getByRole("link"))).not.toContain("text-background");
    cleanup();
    const cream = render(BrandButton, { props: { href: "/x", tone: "cream", children: label } });
    const a = cream.getByRole("link");
    expect(rest(a)).toEqual(expect.arrayContaining(["border-background", "text-background"]));
    expect(rest(a)).not.toContain("text-primary");
    expect(a.className).toMatch(/\bhover:bg-background\b/);
    expect(a.className).toMatch(/\bhover:text-primary\b/);
  });

  it("is the comp's `button light` on the dust tone: dust at rest, a dust fill with garnet on hover", () => {
    const rest = (el: Element) => el.className.split(/\s+/).filter((c) => !c.includes(":"));
    const { getByRole } = render(BrandButton, {
      props: { href: "/contact", tone: "dust", children: label },
    });
    const a = getByRole("link");
    expect(rest(a)).toEqual(expect.arrayContaining(["border-dust", "text-dust"]));
    // Dust is fill-only on light grounds — a dust button must never pick up the
    // garnet tone's resting colours, or the light-ground one dust's.
    expect(rest(a)).not.toContain("text-primary");
    expect(rest(a)).not.toContain("border-primary");
    expect(a.className).toMatch(/\bhover:bg-dust\b/);
    expect(a.className).toMatch(/\bhover:text-primary\b/);
  });
});

// The contact form's submit is a <button> and this component is an <a>, so the
// page wears the button through the module script's exports. That is only the
// same button for as long as the component renders FROM those exports — a
// class added to the markup beside them reaches every link and not the submit.
describe("BrandButton's exported classes", () => {
  const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

  it("are exactly what the component renders, in every tone, with and without the arrow", () => {
    for (const tone of ["garnet", "cream", "dust"] as const) {
      for (const arrow of [false, true]) {
        const { getByRole } = render(BrandButton, {
          props: { href: "/x", tone, arrow, children: label },
        });
        expect(tokens(getByRole("link").className)).toEqual(
          tokens(`${brandButtonBase} ${BRAND_BUTTON_TONES[tone]} ${brandButtonPadding(arrow)}`),
        );
        cleanup();
      }
    }
  });

  it("keep geometry and colour apart, so a caller can pick a tone", () => {
    // Two competing `border-*`/`text-*` sets in one class attribute resolve by
    // stylesheet order, not by the order they were written.
    expect(brandButtonBase).not.toMatch(
      /\b(text|bg|border)-(primary|background|dust|light|dark)\b/,
    );
    expect(brandButtonBase).not.toMatch(/\bp[xlr]-/);
    for (const tone of Object.values(BRAND_BUTTON_TONES)) {
      expect(tone).toMatch(/(^|\s)border-\w+/);
      expect(tone).toMatch(/(^|\s)text-\w+/);
    }
  });
});
