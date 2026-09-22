import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { createRawSnippet } from "svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  // 14 and 9, because the 1px border is OUTSIDE the padding in CSS and inside
  // the frame in Figma: border + padding is the comp's 15 and 10 (#26).
  it("drops the right padding only when the arrow is there, and leaves the border its pixel", () => {
    const plain = render(BrandButton, { props: { href: "/x", children: label } });
    expect(plain.getByRole("link").className).toMatch(/(^|\s)px-\[14px\](\s|$)/);
    cleanup();
    const arrowed = render(BrandButton, { props: { href: "/x", arrow: true, children: label } });
    const a = arrowed.getByRole("link");
    expect(a.className).toMatch(/(^|\s)pr-\[9px\](\s|$)/);
    expect(a.className).toMatch(/(^|\s)pl-\[14px\](\s|$)/);
    expect(a.className).not.toMatch(/px-\[14px\]/);
    expect(a.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  // The whole point of #26 is a NUMBER, and jsdom has no layout — so what this
  // file can hold is the arithmetic: the border is 1px and the padding is one
  // less than the comp's, on both sides that have one.
  it("border plus padding is the comp's 15, and 10 beside the arrow", () => {
    const px = (cls: string, side: "px" | "pl" | "pr") =>
      Number(new RegExp(`(?:^|\\s)${side}-\\[(\\d+)px\\]`).exec(cls)?.[1]);
    const BORDER = 1;
    const plain = render(BrandButton, { props: { href: "/x", children: label } }).getByRole("link");
    expect(plain.className).toContain("border");
    expect(px(plain.className, "px") + BORDER).toBe(15);
    cleanup();
    const arrowed = render(BrandButton, {
      props: { href: "/x", arrow: true, children: label },
    }).getByRole("link");
    expect(px(arrowed.className, "pl") + BORDER).toBe(15);
    expect(px(arrowed.className, "pr") + BORDER).toBe(10);
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

  it("is the comp's `button light` on the light tone: SAND at rest, a sand fill with garnet on hover", () => {
    const rest = (el: Element) => el.className.split(/\s+/).filter((c) => !c.includes(":"));
    const { getByRole } = render(BrandButton, {
      props: { href: "/contact", tone: "light", children: label },
    });
    const a = getByRole("link");
    expect(rest(a)).toEqual(expect.arrayContaining(["border-light", "text-light"]));
    // The light tone is for DARK grounds only — sand is 1.14:1 on the off-white
    // page — so it must never pick up the garnet tone's resting colours.
    expect(rest(a)).not.toContain("text-primary");
    expect(rest(a)).not.toContain("border-primary");
    expect(a.className).toMatch(/\bhover:bg-light\b/);
    expect(a.className).toMatch(/\bhover:text-primary\b/);
  });

  // The operator's 2026-09-22 call moved every button's light colour off dust
  // onto the tan. Dust is still a palette token and still TEXT on garnet
  // (HomeHero's specialty line, the open menu's type), so a guard that only
  // checked the new colour would pass just as happily if a tone quietly went
  // back. This names the thing that must NOT be there.
  it("spends no dust in any tone — that is what moved, and it moved everywhere", () => {
    for (const [tone, classes] of Object.entries(BRAND_BUTTON_TONES)) {
      expect(classes, `the ${tone} tone still spends dust: "${classes}"`).not.toMatch(/-dust\b/);
    }
    expect(BRAND_BUTTON_TONES.garnet).toMatch(/\bhover:text-light\b/);
  });
});

// The contact form's submit is a <button> and this component is an <a>, so the
// page wears the button through the module script's exports. That is only the
// same button for as long as the component renders FROM those exports — a
// class added to the markup beside them reaches every link and not the submit.
describe("BrandButton's exported classes", () => {
  const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

  it("are exactly what the component renders, in every tone, with and without the arrow", () => {
    for (const tone of ["garnet", "cream", "light"] as const) {
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

  it("are findable: docs/COMPONENTS.md's row for this file names every one of them", () => {
    // The index is what a session reads before writing a button, and its
    // extractor cannot see a `<script module>` export: a .svelte row is the
    // props plus the FIRST SENTENCE of the leading comment. These names were
    // first written as that comment's second sentence, the row never changed,
    // and an issue was drafted describing them as indexed. So the exports are
    // read from the source here, not listed, and each must be in the row.
    // (Its freshness is scripts/capability-index.test.ts's. cwd-relative
    // because under jsdom `import.meta.url` is not a file: URL.)
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/components/BrandButton.svelte"),
      "utf8",
    );
    const moduleScript = /<script module[^>]*>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? "";
    const exported = [...moduleScript.matchAll(/^\s*export\s+const\s+(\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual([
      "BRAND_BUTTON_TONES",
      "brandButtonBase",
      "brandButtonPadding",
    ]);

    const index = readFileSync(resolve(process.cwd(), "docs/COMPONENTS.md"), "utf8");
    const row = index
      .split("\n")
      .find((line) => line.includes("(../src/lib/components/BrandButton.svelte)"));
    expect(row, "BrandButton.svelte has no row in docs/COMPONENTS.md").toBeTruthy();
    for (const name of exported) expect(row, `the row does not name \`${name}\``).toContain(name);
  });
});
