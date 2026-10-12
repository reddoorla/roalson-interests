import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import PrivacyNotice from "./PrivacyNotice.svelte";

afterEach(() => cleanup());

describe("PrivacyNotice", () => {
  it("links to the privacy page", () => {
    const { getByTestId } = render(PrivacyNotice);
    const link = getByTestId("privacy-notice").querySelector("a");
    expect(link?.getAttribute("href")).toBe("/privacy");
    expect(link?.textContent).toBe("Privacy Policy");
  });
});
