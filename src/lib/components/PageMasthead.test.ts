import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import PageMasthead from "./PageMasthead.svelte";

afterEach(cleanup);

describe("PageMasthead", () => {
  it("is the page's one h1, set in the ramp's H1 from lg and H2 below it", () => {
    const { getAllByRole } = render(PageMasthead, { props: { title: "Our Properties" } });
    const h1s = getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Our Properties");
    expect(h1s[0].className).toMatch(/\bt-h2\b/);
    expect(h1s[0].className).toMatch(/\blg:t-h1\b/);
  });

  it("puts the title on the listing column's edge from lg, centred below", () => {
    const { getByRole } = render(PageMasthead, { props: { title: "Our Properties" } });
    const h1 = getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/\blg:col-start-2\b/);
    expect(h1.className).toMatch(/\btext-center\b/);
    expect(h1.className).toMatch(/\blg:text-left\b/);
  });
});
