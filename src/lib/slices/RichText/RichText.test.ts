import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import RichText from "./index.svelte";

afterEach(() => cleanup());

const slice = {
  slice_type: "rich_text",
  variation: "default",
  primary: {
    content: [{ type: "paragraph", text: "Body copy from Prismic", spans: [] }],
  },
  items: [],
} as never;

describe("RichText slice", () => {
  it("renders the copy inside a single tagged section", () => {
    const { container } = render(RichText, { props: { slice } });
    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(1);
    expect(sections[0].getAttribute("data-slice-type")).toBe("rich_text");
    expect(sections[0].textContent).toContain("Body copy from Prismic");
  });
});
