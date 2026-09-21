import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./+server";

type Event = Parameters<typeof POST>[0];
const post = (body: BodyInit | null, type = "application/csp-report") =>
  POST({
    request: new Request("http://localhost/api/csp-report", {
      method: "POST",
      body,
      headers: { "content-type": type },
    }),
  } as Event);

describe("/api/csp-report", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  afterEach(() => warn.mockClear());

  it("answers 204 and logs the parsed report", async () => {
    const res = await post(JSON.stringify({ "csp-report": { "blocked-uri": "https://x.test" } }));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(
      "[csp-report]",
      JSON.stringify({ "csp-report": { "blocked-uri": "https://x.test" } }),
    );
  });

  // The body can be read once: a json()-then-text() fallback throws "Body is
  // unusable" here and the report is answered with a 500.
  it.each([
    ["an empty body", ""],
    ["a body that is not JSON", "blocked-uri=https://x.test"],
  ])("answers 204 for %s, and logs what it was sent", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("[csp-report]", JSON.stringify(body));
  });
});
