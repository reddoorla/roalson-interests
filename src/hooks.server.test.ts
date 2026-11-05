import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handle } from "./hooks.server";
import {
  CMS_FRAMED_ROUTES,
  CMS_FRAME_ANCESTORS,
  isCmsFramedRoute,
  widenFrameAncestors,
} from "$lib/security/cms-framing";

const POLICY =
  "default-src 'self'; frame-src 'self' https://repo.prismic.io; frame-ancestors 'self'; base-uri 'self'";

async function headersFor(
  pathname: string,
  routeId: string | null,
  policy: string | null = POLICY,
) {
  const response = await handle({
    event: { url: new URL(`https://example.com${pathname}`), route: { id: routeId } } as never,
    resolve: async () =>
      new Response("<html></html>", {
        headers: {
          "content-type": "text/html",
          ...(policy ? { "Content-Security-Policy": policy } : {}),
        },
      }),
  });
  return response.headers;
}

describe("CMS framing", () => {
  it("keeps every ordinary page SAMEORIGIN with frame-ancestors 'self'", async () => {
    const headers = await headersFor("/about", "/[[preview=preview]]/[uid]");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Content-Security-Policy")).toBe(POLICY);
  });

  it("lets Prismic frame /slice-simulator: no X-Frame-Options, widened frame-ancestors", async () => {
    const headers = await headersFor("/slice-simulator", "/slice-simulator");
    expect(headers.get("X-Frame-Options")).toBeNull();
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain(CMS_FRAME_ANCESTORS);
    expect(csp.match(/frame-ancestors/g)).toHaveLength(1);
    expect(csp).toContain("frame-src 'self' https://repo.prismic.io");
    expect(csp).toContain("base-uri 'self'");
  });

  it("frames the route SvelteKit resolved, so an encoded path gets the same headers", async () => {
    const headers = await headersFor("/slice%2Dsimulator", "/slice-simulator");
    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("Content-Security-Policy")).toContain(CMS_FRAME_ANCESTORS);
  });

  it("keeps a path that only looks like the simulator SAMEORIGIN when no route matched", async () => {
    const headers = await headersFor("/slice-simulator", null);
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Content-Security-Policy")).toBe(POLICY);
  });

  it("names only route ids that exist, so moving the page cannot silently unframe it", () => {
    for (const id of CMS_FRAMED_ROUTES) {
      const dir = join("src/routes", ...id.split("/").filter(Boolean));
      expect(
        readdirSync(dir).some((file) => file.startsWith("+page.")),
        id,
      ).toBe(true);
    }
  });

  it("matches the route id exactly", () => {
    expect(isCmsFramedRoute("/slice-simulator")).toBe(true);
    expect(isCmsFramedRoute("/slice-simulator/")).toBe(false);
    expect(isCmsFramedRoute("/slice-simulator-x")).toBe(false);
    expect(isCmsFramedRoute("/slice-simulator/x")).toBe(false);
    expect(isCmsFramedRoute("/[[preview=preview]]/[uid]")).toBe(false);
    expect(isCmsFramedRoute(null)).toBe(false);
  });

  it("adds frame-ancestors when the policy has none", () => {
    expect(widenFrameAncestors("default-src 'self'")).toBe(
      `default-src 'self'; ${CMS_FRAME_ANCESTORS}`,
    );
  });

  it("still answers an old www.roalson.com URL with its 301 before any of this", async () => {
    const response = await handle({
      event: { url: new URL("https://example.com/prop.htm"), route: { id: null } } as never,
      resolve: async () => {
        throw new Error("a legacy URL must not reach the router");
      },
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/properties");
  });

  it("leaves a response without a CSP without one", async () => {
    const headers = await headersFor("/slice-simulator", "/slice-simulator", null);
    expect(headers.get("Content-Security-Policy")).toBeNull();
    expect(headers.get("X-Frame-Options")).toBeNull();
  });
});
