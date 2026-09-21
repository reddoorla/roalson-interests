import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import Form from "./Form.svelte";

afterEach(() => cleanup());

describe("Form", () => {
  it("does not render a summary when there are no errors", () => {
    const { queryByRole } = render(Form);
    expect(queryByRole("alert")).toBeNull();
  });

  it("renders an error summary when errors are present", () => {
    const { getByRole, getByText } = render(Form, {
      errors: { email: "Email is required", message: "Message too short" },
    });
    const alert = getByRole("alert");
    expect(alert).toBeTruthy();
    expect(getByText("Email is required")).toBeTruthy();
    expect(getByText("Message too short")).toBeTruthy();
  });

  it("error summary is focusable for screen-reader announcement", () => {
    const { getByRole } = render(Form, {
      errors: { email: "Required" },
    });
    const alert = getByRole("alert");
    expect(alert.getAttribute("tabindex")).toBe("-1");
  });

  it("takes focus when errors arrive, and names itself by its title", async () => {
    // The behaviour the skin below must not disturb: a failed submit leaves the
    // visitor on a button at the bottom of the form, and the summary is at the
    // top of it.
    const { getByRole } = render(Form, { errors: { email: "Required" } });
    const alert = getByRole("alert");
    await vi.waitFor(() => expect(document.activeElement).toBe(alert));
    const title = document.getElementById(alert.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent?.trim()).toBe("There was a problem with your submission");
  });
});

describe("Form's error summary skin", () => {
  it("spends only theme tokens — nothing from Tailwind's default palette", () => {
    // It was `border-red-600 bg-red-50 text-red-900`: outside the theme, so
    // theme-contrast.test.ts measured none of it (red-600 is 4.15:1 on this
    // site's off-white). Same class as Field's invalid border and the contact
    // page's two panels; fixed together on 2026-09-21.
    const { container, getByRole } = render(Form, { errors: { email: "Required" } });
    expect(container.innerHTML).not.toMatch(
      /\b(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    );
    const alert = getByRole("alert");
    expect(alert.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["border", "border-error"]),
    );
    expect(alert.className).not.toMatch(/rounded|border-\d/);
    // Every line of text in it is the measured error token.
    for (const el of [alert.querySelector("h2"), alert.querySelector("ul")]) {
      expect(el?.className.split(/\s+/)).toContain("text-error");
    }
  });
});
