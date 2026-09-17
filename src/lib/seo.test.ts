import { describe, it, expect } from "vitest";
import {
  jsonLdScript,
  canonicalUrl,
  resolveOgImage,
  organizationJsonLd,
  composeTitle,
  isNoindexPath,
  NOINDEX_ENFORCED,
  NOINDEX_PREFIXES,
  SITE_NAME,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
} from "./seo";

const PRISMIC = "https://images.prismic.io/acme/abc.png?auto=compress";

// Assert against SITE_NAME, never the template's literal brand: `/new-site`
// step 3b sets SITE_NAME per client, so a hard-coded "Reddoor" made these four
// tests fail on every site the moment it de-branded — a mandatory step. What is
// under test is composeTitle's behaviour, not the brand string.
describe("composeTitle", () => {
  it("appends the site name for brand recall", () => {
    expect(composeTitle("Contact")).toBe(`Contact | ${SITE_NAME}`);
  });

  it("returns the bare site name for the home page (no page title)", () => {
    expect(composeTitle(undefined)).toBe(SITE_NAME);
    expect(composeTitle("")).toBe(SITE_NAME);
    expect(composeTitle("   ")).toBe(SITE_NAME);
  });

  it("does not double the brand when the title already contains it", () => {
    expect(composeTitle(SITE_NAME)).toBe(SITE_NAME);
    expect(composeTitle(`${SITE_NAME} — Work`)).toBe(`${SITE_NAME} — Work`);
  });
});

describe("jsonLdScript", () => {
  it("wraps data in an ld+json script tag", () => {
    const out = jsonLdScript({ "@type": "Thing", name: "x" });
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@type":"Thing"');
    expect(out.endsWith("</script>")).toBe(true);
  });

  it("escapes < so CMS strings cannot break out of the script tag", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script><script>alert");
    expect(out).toContain("\\u003c/script>");
    // The only literal </script> is the real closing tag.
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe("canonicalUrl", () => {
  it("drops the query string and hash", () => {
    expect(canonicalUrl(new URL("https://acme.com/about?utm_source=x#top"))).toBe(
      "https://acme.com/about",
    );
  });

  it("strips the /preview route segment", () => {
    expect(canonicalUrl(new URL("https://acme.com/preview/work"))).toBe("https://acme.com/work");
  });

  it("maps a bare /preview to the home page", () => {
    expect(canonicalUrl(new URL("https://acme.com/preview"))).toBe("https://acme.com/");
  });

  it("leaves a normal path untouched", () => {
    expect(canonicalUrl(new URL("https://acme.com/team/jane"))).toBe("https://acme.com/team/jane");
  });

  it("does not strip paths that merely start with the word preview", () => {
    expect(canonicalUrl(new URL("https://acme.com/previews/2024"))).toBe(
      "https://acme.com/previews/2024",
    );
  });

  it("accepts a string url", () => {
    expect(canonicalUrl("https://acme.com/x?y=1")).toBe("https://acme.com/x");
  });
});

describe("resolveOgImage", () => {
  it("returns undefined when there is no image", () => {
    expect(resolveOgImage(undefined, "https://acme.com")).toBeUndefined();
    expect(resolveOgImage("", "https://acme.com")).toBeUndefined();
  });

  it("crops a Prismic image to the card canvas and reports its size", () => {
    const og = resolveOgImage(PRISMIC, "https://acme.com");
    expect(og?.width).toBe(OG_IMAGE_WIDTH);
    expect(og?.height).toBe(OG_IMAGE_HEIGHT);
    const u = new URL(og!.url);
    expect(u.searchParams.get("w")).toBe(String(OG_IMAGE_WIDTH));
    expect(u.searchParams.get("h")).toBe(String(OG_IMAGE_HEIGHT));
    expect(u.searchParams.get("fit")).toBe("crop");
  });

  it("passes an absolute non-Prismic URL through without dimensions", () => {
    const og = resolveOgImage("https://cdn.example.com/card.jpg", "https://acme.com");
    expect(og).toEqual({ url: "https://cdn.example.com/card.jpg" });
  });

  it("makes a root-relative static asset absolute against the origin", () => {
    expect(resolveOgImage("/og-default.png", "https://acme.com")).toEqual({
      url: "https://acme.com/og-default.png",
    });
  });

  it("rejects a non-http(s) scheme instead of emitting it as a card", () => {
    expect(resolveOgImage("javascript:alert(1)", "https://acme.com")).toBeUndefined();
    expect(resolveOgImage("data:image/png;base64,AAAA", "https://acme.com")).toBeUndefined();
  });
});

describe("organizationJsonLd", () => {
  it("emits the given type and drops empty fields", () => {
    const ld = organizationJsonLd({
      name: "Acme",
      url: "https://acme.com",
      type: "LocalBusiness",
      telephone: "",
      logo: undefined,
    }) as Record<string, unknown>;
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld.name).toBe("Acme");
    expect("telephone" in ld).toBe(false);
    expect("logo" in ld).toBe(false);
  });

  it("defaults to Organization and nests a PostalAddress", () => {
    const ld = organizationJsonLd({
      name: "Acme",
      url: "https://acme.com",
      sameAs: ["https://instagram.com/acme"],
      address: {
        streetAddress: "1 Main",
        addressLocality: "Austin",
        addressRegion: "TX",
        postalCode: "78701",
      },
    }) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Organization");
    expect(ld.sameAs).toEqual(["https://instagram.com/acme"]);
    expect(ld.address).toMatchObject({
      "@type": "PostalAddress",
      addressCountry: "US",
      addressLocality: "Austin",
    });
  });

  it("omits sameAs when the list is empty", () => {
    const ld = organizationJsonLd({
      name: "Acme",
      url: "https://acme.com",
      sameAs: [],
    }) as Record<string, unknown>;
    expect("sameAs" in ld).toBe(false);
  });
});

// robots.txt's Disallow and the layout's `noindex` meta answer DIFFERENT
// questions — "don't fetch this" vs "don't list this" — and only the first was
// being asked. `prerender = "auto"` emits the /dev/* fixtures as public static
// HTML in the deployed build, and a Disallow does not stop Google indexing a
// URL it discovered elsewhere and listing it with no snippet. Both now come
// from NOINDEX_PREFIXES; these keep them from drifting apart again.
describe("noindex routes", () => {
  it("covers the dev fixtures, the slice simulator and preview URLs", () => {
    expect(NOINDEX_PREFIXES).toEqual(["/dev/", "/slice-simulator", "/preview/"]);
  });

  it("marks every dev/tooling route noindex", () => {
    for (const p of [
      "/dev/a11y-fixtures",
      "/dev/animate-in",
      "/slice-simulator",
      "/preview/about",
    ]) {
      expect(isNoindexPath(p), p).toBe(true);
    }
  });

  it("leaves every real content route indexable", () => {
    for (const p of ["/", "/about", "/contact", "/work/case-study"]) {
      expect(isNoindexPath(p), p).toBe(false);
    }
  });

  it("does not match a content route that merely starts with the same letters", () => {
    // "/development" must not be caught by the "/dev/" prefix — the trailing
    // slash is load-bearing.
    expect(isNoindexPath("/development")).toBe(false);
    expect(isNoindexPath("/work/dev/x")).toBe(false);
  });

  // Noindex is a PRODUCTION contract. The fleet lighthouse audit scores
  // /dev/a11y-fixtures on `vite dev`, where both a robots meta and a robots.txt
  // Disallow fail its is-crawlable audit — so the fence drops on the dev server
  // only. Vitest also runs with DEV=true, hence the MODE escape it relies on.
  it("is enforced under the test runner, which stands in for production", () => {
    expect(NOINDEX_ENFORCED).toBe(true);
  });
});
