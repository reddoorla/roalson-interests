import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { createRawSnippet } from "svelte";

import BrandButton from "./BrandButton.svelte";

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
});
