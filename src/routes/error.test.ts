import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  page: { status: 404, error: { message: "Not Found" } as { message: string } | null },
}));
vi.mock("$app/state", () => state);

const { default: ErrorPage } = await import("./+error.svelte");

/** reddoor-maintenance src/recipes/launch.ts SITE_404_MARKER, as it reads. */
const SITE_404_MARKER = /<h1[^>]*>\s*404\s*<\/h1>/i;

afterEach(() => {
  cleanup();
  state.page = { status: 404, error: { message: "Not Found" } };
});

describe("the error page", () => {
  it("keeps the launch gate's marker: the only h1, and it is the status alone", () => {
    const { container } = render(ErrorPage);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("404");
    expect(h1s[0].outerHTML).toMatch(SITE_404_MARKER);
  });

  it("names the page for the tab and keeps it out of search", () => {
    render(ErrorPage);
    expect(document.title).toBe("Page not found | Roalson Interests");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex",
    );
  });

  it("offers the ways on: properties, contact and home", () => {
    const { getByRole } = render(ErrorPage);
    expect(getByRole("link", { name: "Properties" }).getAttribute("href")).toBe("/properties");
    expect(getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("/contact");
    expect(getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
  });

  it("says something went wrong, not 'not found', for any other status", () => {
    state.page = { status: 500, error: { message: "Internal Error" } };
    const { container, getByRole } = render(ErrorPage);
    expect(container.querySelector("h1")?.textContent).toBe("500");
    expect(container.textContent).toContain("Something went wrong");
    expect(container.textContent).not.toContain("Page not found");
    expect(getByRole("link", { name: /\(210\)/ }).getAttribute("href")).toMatch(/^tel:/);
  });
});
