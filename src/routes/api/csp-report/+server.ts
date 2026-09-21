import type { RequestHandler } from "./$types";

/**
 * CSP violation reports land here. Browsers POST either the legacy
 * `application/csp-report` body or the modern `application/reports+json`
 * batched body when `report-uri` / `report-to` directives are set.
 *
 * In production, forward to a real sink (Sentry, Datadog, Logflare).
 */
export const POST: RequestHandler = async ({ request }) => {
  // A body can be read ONCE. `json()` then a `text()` fallback looks like a
  // fallback and is not one: when `json()` throws on an empty or non-JSON body
  // it has already consumed the stream, `text()` throws "Body is unusable", and
  // the browser's report is answered with a 500. Read once, parse after.
  const raw = await request.text();
  let payload: unknown = raw;
  try {
    payload = JSON.parse(raw);
  } catch {
    // not JSON — the text is the payload
  }
  console.warn("[csp-report]", JSON.stringify(payload));
  return new Response(null, { status: 204 });
};
