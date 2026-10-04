import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { OFFICE, officeDirectionsUrl } from "$lib/office";

// `use:enhance` needs no behaviour here — these cases are about what the page
// renders and where focus lands, not about submission.
vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
}));
// No sitekey → TurnstileWidget renders nothing, as in dev and in CI. Mutable so
// ONE case can set a key and see where the mount point lands.
const publicEnv = vi.hoisted(() => ({ env: {} as { PUBLIC_TURNSTILE_SITE_KEY?: string } }));
vi.mock("$env/dynamic/public", () => publicEnv);

const { default: ContactPage } = await import("./+page.svelte");

const FORM_TS = 1_700_000_000_000;
const props = (form: unknown = null) => ({ data: { formTs: FORM_TS }, form }) as never;

beforeEach(() => {
  delete publicEnv.env.PUBLIC_TURNSTILE_SITE_KEY;
  delete window.turnstile;
});
afterEach(() => cleanup());

describe("the contact page's submit button", () => {
  it("signals the wait with aria-busy", () => {
    // aria-busy so the state change reaches a screen reader instead of only
    // the accessible name silently mutating to "Sending…".
    const { container } = render(ContactPage, props());
    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("is a real submit <button>", () => {
    const { getByRole } = render(ContactPage, props());
    const button = getByRole("button", { name: "Send message" });
    expect(button.getAttribute("type")).toBe("submit");
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

  it("replaces the form, under the heading that named it, and offers the phone", () => {
    const { container, getByRole } = render(ContactPage, props({ success: true }));
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    // The SECTION carries the name, so it outlives the form.
    const region = getByRole("region", { name: "Send Us a Message" });
    const status = region.querySelector('[role="status"]') as HTMLElement;
    expect(status).not.toBeNull();
    expect(status.querySelector(`a[href="${OFFICE.phone.href}"]`)?.textContent?.trim()).toBe(
      OFFICE.phone.display,
    );
  });
});

describe("the contact page's failure", () => {
  it("shows the action's message in an alert", () => {
    const { getByRole } = render(ContactPage, props({ error: "It broke." }));
    expect(getByRole("alert").textContent?.trim()).toBe("It broke.");
  });

  // The alert is the form's first row and the submit its last: a failed send
  // left the visitor on the button with the explanation off-screen above them.
  it("takes focus, as the confirmation does", async () => {
    const { getByRole } = render(ContactPage, props({ error: "It broke." }));
    const alert = getByRole("alert");
    expect(alert.getAttribute("tabindex")).toBe("-1");
    await vi.waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("keeps the form mounted, so what was typed is still there to resend", () => {
    const { container } = render(ContactPage, props({ error: "It broke." }));
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe("the contact page's head and office", () => {
  it("has one h1, and it is the masthead's", () => {
    const { container } = render(ContactPage, props());
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent?.trim()).toBe("Contact Us");
    expect(h1s[0].closest("header")).not.toBeNull();
    // The layout owns the page's one <main>.
    expect(container.querySelector("main")).toBeNull();
  });

  it("prints the office from $lib/office — the client's ZIP, a dialable number", () => {
    const { container } = render(ContactPage, props());
    const address = container.querySelector("address");
    expect(address?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "17721 Rogers Ranch Parkway Suite 125 San Antonio, TX 78258",
    );
    const tel = container.querySelector('a[href="tel:+12104965800"]');
    expect(tel?.textContent?.trim()).toBe("(210) 496-5800");
  });

  it("links to directions in a new tab, and says so", () => {
    const { getByRole } = render(ContactPage, props());
    const link = getByRole("link", { name: /Get directions/ });
    expect(link.getAttribute("href")).toBe(officeDirectionsUrl());
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("(opens in a new tab)");
  });

  it("names both columns, and neither name is the form's own", () => {
    const { getByRole, container } = render(ContactPage, props());
    expect(getByRole("region", { name: "Our Office" })).toBeTruthy();
    expect(getByRole("region", { name: "Send Us a Message" })).toBeTruthy();
    const form = container.querySelector("form") as HTMLFormElement;
    expect(form.hasAttribute("aria-labelledby")).toBe(false);
    expect(form.hasAttribute("aria-label")).toBe(false);
  });
});

// What createIngestAction and the fleet's form-e2e probe read. None of this is
// the page's to change; a redesign is exactly when it gets changed by accident.
describe("the contact form's contract with the ingest action", () => {
  it("posts, natively validated, to the page's own action", () => {
    const { container } = render(ContactPage, props());
    const form = container.querySelector("form") as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("POST");
    // Nothing server-side validates a field, so the browser must.
    expect(form.hasAttribute("novalidate")).toBe(false);
    // A bare fragment: same path, same query (UTM params reach `sourceUrl`).
    expect(form.getAttribute("action")).toBe("#contact-form");
    expect(container.querySelector("section#contact-form")?.contains(form)).toBe(true);
  });

  it("carries the fill-timing token and the honeypot, verbatim", () => {
    const { container } = render(ContactPage, props());
    const form = container.querySelector("form") as HTMLFormElement;
    const ts = form.querySelector('input[name="ts"]') as HTMLInputElement;
    expect(ts.type).toBe("hidden");
    expect(ts.value).toBe(String(FORM_TS));

    const pot = form.querySelector('input[name="bot-field"]') as HTMLInputElement;
    expect(pot.type).toBe("text");
    expect(pot.getAttribute("tabindex")).toBe("-1");
    expect(pot.getAttribute("autocomplete")).toBe("off");
    expect(pot.getAttribute("aria-hidden")).toBe("true");
    expect(pot.className).toBe("hidden");
    expect(pot.value).toBe("");
  });

  it("names, types and requires the four fields as buildPayload reads them", () => {
    const { container } = render(ContactPage, props());
    const form = container.querySelector("form") as HTMLFormElement;
    const field = (name: string) =>
      form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement;
    const describe = (name: string) => {
      const el = field(name);
      return {
        tag: el.tagName,
        type: el.getAttribute("type"),
        required: el.required,
        autocomplete: el.getAttribute("autocomplete"),
      };
    };
    expect(describe("name")).toEqual({
      tag: "INPUT",
      type: "text",
      required: true,
      autocomplete: "name",
    });
    expect(describe("email")).toEqual({
      tag: "INPUT",
      type: "email",
      required: true,
      autocomplete: "email",
    });
    expect(describe("phone")).toEqual({
      tag: "INPUT",
      type: "tel",
      required: false,
      autocomplete: "tel",
    });
    expect(describe("message")).toEqual({
      tag: "TEXTAREA",
      type: null,
      required: true,
      autocomplete: null,
    });
    expect(field("message").getAttribute("maxlength")).toBe("5000");
  });

  it("mounts Turnstile INSIDE the form, where Cloudflare injects its response", async () => {
    // Cloudflare writes `cf-turnstile-response` into the form that ENCLOSES the
    // mount point; createIngestAction reads it from the posted form.
    publicEnv.env.PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    window.turnstile = { render: vi.fn(() => "w"), remove: vi.fn(), reset: vi.fn() };
    const { container } = render(ContactPage, props());
    const mount = container.querySelector(".cf-turnstile");
    expect(mount).not.toBeNull();
    expect(mount?.closest("form")).toBe(container.querySelector("form"));
  });
});
