import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import Testimonial from "./index.svelte";
import { resolveAvatarAlt } from "./avatarAlt";

afterEach(() => cleanup());

const image = {
  url: "https://img.example/dana.jpg",
  alt: null,
  dimensions: { width: 400, height: 400 },
} as never;

const makeSlice = (primary: Record<string, unknown>) =>
  ({
    slice_type: "testimonial",
    variation: "default",
    primary: {
      label: null,
      quote: null,
      name: null,
      role: null,
      avatar: null,
      ...primary,
    },
    items: [],
  }) as never;

describe("Testimonial slice", () => {
  it("renders the quote inside figure/blockquote with the name as plain text", () => {
    const { container, getByText } = render(Testimonial, {
      props: {
        slice: makeSlice({
          quote: "They shipped in six weeks.",
          name: "Dana Whitfield",
          role: "Director of Operations",
        }),
      },
    });

    const figure = container.querySelector("figure");
    expect(figure).not.toBeNull();
    expect(figure?.querySelector("blockquote")?.textContent).toContain(
      "They shipped in six weeks.",
    );
    expect(figure?.querySelector("figcaption")?.textContent).toContain("Dana Whitfield");
    // The credit is NOT a heading — a name does not title a section.
    expect(figure?.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    // Carries the slice-identity data attributes for parity with siblings.
    expect(container.querySelector('[data-slice-type="testimonial"]')).not.toBeNull();
    expect(getByText("Director of Operations")).toBeTruthy();
  });

  it("stores the quote bare — the marks are drawn by CSS, not content", () => {
    const { container } = render(Testimonial, {
      props: {
        slice: makeSlice({ quote: "No curly marks in the CMS." }),
      },
    });
    const quote = container.querySelector(".quote");
    expect(quote?.textContent?.trim()).toBe("No curly marks in the CMS.");
    expect(quote?.textContent).not.toContain("“");
  });

  it("renders the label as the section h2", () => {
    const { container } = render(Testimonial, {
      props: {
        slice: makeSlice({ label: "What clients are saying", quote: "Great." }),
      },
    });
    expect(container.querySelector("h2")?.textContent?.trim()).toBe("What clients are saying");
  });

  it("falls back to the credited name for the avatar alt", () => {
    const { container } = render(Testimonial, {
      props: {
        slice: makeSlice({ avatar: image, name: "Dana Whitfield" }),
      },
    });
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Dana Whitfield");
  });

  it("keeps an unnamed avatar decorative but announces the authored alt", () => {
    const authored = { ...(image as object), alt: "A smiling client" } as never;
    const { container } = render(Testimonial, {
      props: { slice: makeSlice({ avatar: authored }) },
    });
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("A smiling client");
    // Nothing else names the subject, so the alt is repeated visually-hidden.
    expect(container.querySelector(".sr-only")?.textContent).toBe("A smiling client");
  });

  it("renders an empty section when the slice has no content", () => {
    const { container } = render(Testimonial, {
      props: { slice: makeSlice({}) },
    });
    expect(container.querySelector("figure")).toBeNull();
  });
});

describe("resolveAvatarAlt", () => {
  it("prefers the authored alt", () => {
    expect(resolveAvatarAlt("Headshot of Dana", "Dana")).toBe("Headshot of Dana");
  });

  it("falls back to the name, then to null", () => {
    expect(resolveAvatarAlt("  ", "Dana")).toBe("Dana");
    expect(resolveAvatarAlt(null, "  ")).toBeNull();
    expect(resolveAvatarAlt(undefined, undefined)).toBeNull();
  });
});
