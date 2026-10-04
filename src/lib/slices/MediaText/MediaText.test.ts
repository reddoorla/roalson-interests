import { render } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import type { Content } from "@prismicio/client";
import MediaText from "./index.svelte";

function makeSlice(variation: "imageRight" | "imageLeft") {
  return {
    slice_type: "media_text",
    variation,
    primary: {
      heading: [{ type: "heading2", text: "Amenities", spans: [] }],
      body: [{ type: "paragraph", text: "A resort-style pool.", spans: [] }],
      media: {
        url: "https://img.example/pool.jpg",
        alt: "Pool",
        dimensions: { width: 800, height: 600 },
      },
    },
    items: [],
  } as unknown as Content.MediaTextSlice;
}

describe("MediaText slice", () => {
  it("renders heading, body, and image with alt", () => {
    const { getByRole } = render(MediaText, {
      props: { slice: makeSlice("imageRight") },
    });
    expect(getByRole("heading", { level: 2 }).textContent).toContain("Amenities");
    expect(getByRole("img").getAttribute("alt")).toBe("Pool");
  });

  it("lays imageLeft out differently from imageRight", () => {
    const markup = (variation: "imageRight" | "imageLeft") =>
      render(MediaText, { props: { slice: makeSlice(variation) } }).container.querySelector(
        'section[data-slice-type="media_text"]',
      )!.innerHTML;
    expect(markup("imageLeft")).not.toBe(markup("imageRight"));
  });
});
