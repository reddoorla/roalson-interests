import { describe, it, expect, vi, beforeEach } from "vitest";
import { OFFICE } from "$lib/office";

// Mutated in place (never reassigned) so the module keeps the reference the
// factory captured — the pattern health/server.test.ts uses.
const mocks = vi.hoisted(() => ({
  privateEnv: {} as Record<string, string | undefined>,
  replyCopyFor: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("$env/dynamic/private", () => ({ env: mocks.privateEnv }));
// The confirmation-copy lookup reads Prismic; nothing here may touch a network.
vi.mock("$lib/server/reply-copy", () => ({ replyCopyFor: mocks.replyCopyFor }));

import { actions, load, prerender } from "./+page.server";

type Failure = { status: number; data: { error: string } };

/** A submission old enough to clear the fill-timing screen, honeypot empty. */
function submission(fields: Record<string, string> = {}) {
  const body = new FormData();
  body.set("ts", String(Date.now() - 60_000));
  body.set("bot-field", "");
  body.set("name", "Ada Lovelace");
  body.set("email", "ada@example.com");
  body.set("phone", "");
  body.set("message", "Hello.");
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return body;
}

const ingest = vi.fn<typeof fetch>();

function event(body: FormData, href = "https://example.com/contact?utm_source=test") {
  return {
    request: { formData: async () => body },
    fetch: ingest,
    url: new URL(href),
  } as unknown as Parameters<typeof actions.default>[0];
}

beforeEach(() => {
  delete mocks.privateEnv.FORMS_INGEST_URL;
  delete mocks.privateEnv.FORMS_INGEST_TOKEN;
  mocks.replyCopyFor.mockReset();
  mocks.replyCopyFor.mockResolvedValue(undefined);
  ingest.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/contact load", () => {
  it("claims the dark first band, titles the page as the masthead does, and stays dynamic", () => {
    const data = load({} as never) as Record<string, unknown>;
    // nav-over.test.ts holds the LITERAL in this file to the page's markup;
    // this holds what the layout actually receives.
    expect(data.navOver).toBe("dark");
    expect(data.title).toBe("Contact Us");
    expect(String(data.meta_description)).toContain(OFFICE.phone.display);
    // A form action cannot run on a prerendered route.
    expect(prerender).toBe(false);
  });

  it("plants a fresh fill-timing token on every request", () => {
    const before = Date.now();
    const { formTs } = load({} as never) as { formTs: number };
    expect(formTs).toBeGreaterThanOrEqual(before);
    expect(formTs).toBeLessThanOrEqual(Date.now());
  });
});

describe("/contact action — what a visitor is told when it fails", () => {
  // The shared package's defaults end "Please email us directly". This site
  // prints no email address anywhere (the comp has none), so that sentence
  // sends a visitor looking for something that is not on the page.
  it("names the office phone, not an email address, when ingest is not configured", async () => {
    const result = (await actions.default(event(submission()))) as Failure;
    expect(result.status).toBe(500);
    expect(result.data.error).toContain(OFFICE.phone.display);
    expect(result.data.error).not.toMatch(/e-?mail/i);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("names the office phone when ingest refuses the submission", async () => {
    mocks.privateEnv.FORMS_INGEST_URL = "https://ingest.invalid/api/forms/roalson";
    mocks.privateEnv.FORMS_INGEST_TOKEN = "t";
    ingest.mockResolvedValue(new Response(JSON.stringify({ error: "nope" }), { status: 503 }));
    const result = (await actions.default(event(submission()))) as Failure;
    expect(result.status).toBe(502);
    expect(result.data.error).toContain(OFFICE.phone.display);
    expect(result.data.error).not.toMatch(/e-?mail/i);
  });
});

describe("/contact action — the payload the dashboard receives", () => {
  beforeEach(() => {
    mocks.privateEnv.FORMS_INGEST_URL = "https://ingest.invalid/api/forms/roalson";
    mocks.privateEnv.FORMS_INGEST_TOKEN = "t";
    ingest.mockResolvedValue(new Response(JSON.stringify({ ok: true, id: "1" }), { status: 200 }));
  });

  it("forwards the four fields, the full source URL and the form type", async () => {
    const result = await actions.default(
      event(submission({ phone: "(210) 555-0100", message: "About 25331 IH 10 West." })),
    );
    expect(result).toEqual({ success: true });
    expect(ingest).toHaveBeenCalledTimes(1);
    const [url, init] = ingest.mock.calls[0];
    expect(url).toBe("https://ingest.invalid/api/forms/roalson");
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent).toMatchObject({
      formType: "contact",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "(210) 555-0100",
      message: "About 25331 IH 10 West.",
      // The query string rides along, so UTM params reach the dashboard.
      sourceUrl: "https://example.com/contact?utm_source=test",
    });
    // A real visitor never sets it, so it must not be forwarded as `false`.
    expect("testMode" in sent).toBe(false);
  });

  it("forwards testMode only when the fleet's probe sets it", async () => {
    await actions.default(event(submission({ testMode: "true" })));
    const sent = JSON.parse(String((ingest.mock.calls[0][1] as RequestInit).body));
    expect(sent.testMode).toBe(true);
  });

  it("answers success WITHOUT forwarding a lead when the honeypot is filled", async () => {
    // By design: a bot learns nothing. It is also why the confirmation panel
    // is not evidence of delivery.
    const result = await actions.default(event(submission({ "bot-field": "http://spam" })));
    expect(result).toEqual({ success: true });
    const bodies = ingest.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    );
    expect(bodies.filter((b) => "name" in b || "message" in b)).toEqual([]);
  });
});
