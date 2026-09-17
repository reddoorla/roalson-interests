import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

// `use:enhance` needs no behaviour here — these cases are about what the page
// renders and where focus lands, not about submission.
vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
}));
// No sitekey → TurnstileWidget renders nothing, as in dev and in CI.
vi.mock("$env/dynamic/public", () => ({ env: {} }));

const { default: ContactPage } = await import("./+page.svelte");

const props = (form: unknown = null) => ({ data: { formTs: 1_700_000_000_000 }, form }) as never;

afterEach(() => cleanup());

describe("the contact page's submit button", () => {
  // `disabled:opacity-60` composited the label against the faded button at the
  // exact moment someone is waiting on it and deciding whether to click again —
  // the least readable state on the page, during the only wait it has.
  it("stays at full strength while sending", () => {
    const { container } = render(ContactPage, props());
    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.className).not.toContain("disabled:opacity-60");
  });

  it("signals the wait with a cursor and aria-busy, not by dimming", () => {
    // aria-busy so the state change reaches a screen reader instead of only
    // the accessible name silently mutating to "Sending…".
    const { container } = render(ContactPage, props());
    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.className).toContain("disabled:cursor-wait");
    expect(button.getAttribute("aria-busy")).toBe("false");
  });
});

describe("the contact page's confirmation", () => {
  // On success the form unmounts, which leaves focus on a submit button that no
  // longer exists — focus falls to <body> and a keyboard or screen-reader user
  // is dropped at the top of the document with no idea it went through.
  it("takes focus when it replaces the form", async () => {
    const { container } = render(ContactPage, props({ success: true }));
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status).not.toBeNull();
    expect(status.getAttribute("tabindex")).toBe("-1");
    await vi.waitFor(() => expect(document.activeElement).toBe(status));
  });
});
