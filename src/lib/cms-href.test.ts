import { describe, expect, it } from "vitest";
import type { LinkField } from "@prismicio/client";

import { cmsHref, sitePath } from "./cms-href";
import { linkResolver } from "./prismicio";

const web = (url: string) => ({ link_type: "Web", url }) as unknown as LinkField;

describe("sitePath — a CMS URL reduced to the route it means", () => {
  // /contact and /properties are filesystem routes, not documents, so an
  // editor can only reach them through a Web link — and a Web link wants a
  // URL. Every row below is a shape that field can end up holding for the
  // same intent: "this site's /contact".
  it.each([
    ["/contact", "/contact"],
    ["contact", "/contact"],
    ["properties/25331-ih-10-west", "/properties/25331-ih-10-west"],
    // The editor glues a scheme onto a bare path; the host is then EMPTY…
    ["https:///contact", "/contact"],
    ["http:///contact", "/contact"],
    [
      "https:///properties/25331-ih-10-west?from=home#map",
      "/properties/25331-ih-10-west?from=home#map",
    ],
    // …or, glued onto a bare word, the word BECOMES the host. No public host
    // is dotless, so that is a path too. (WHATWG parsing turns the rows above
    // into this one: new URL("https:///contact").host === "contact".)
    ["https://contact", "/contact"],
    ["https://properties/25331-ih-10-west", "/properties/25331-ih-10-west"],
    // An absolute URL to this site is the same route on WHATEVER host is
    // serving — a deploy preview must not send its visitor to production, and
    // before cutover www.roalson.com is still the OLD site.
    ["https://www.roalson.com/contact", "/contact"],
    ["https://roalson.com/contact", "/contact"],
    ["http://WWW.Roalson.com/properties?x=1#top", "/properties?x=1#top"],
    ["https://www.roalson.com", "/"],
    ["https://www.roalson.com/", "/"],
    ["  /contact  ", "/contact"],
  ])("%s → %s", (input, expected) => {
    expect(sitePath(input)).toBe(expected);
  });

  // The partners band's CONTACT link invites an address. Before these rows
  // `mhoward@roalson.com` resolved to "/" — user mhoward at this site's own
  // host — and the visitor landed on the homepage with nothing to say why.
  it.each([
    ["mhoward@roalson.com", "mailto:mhoward@roalson.com"],
    ["  mhoward@roalson.com ", "mailto:mhoward@roalson.com"],
    ["https://mhoward@roalson.com", "mailto:mhoward@roalson.com"],
    ["https://mhoward@roalson.com/", "mailto:mhoward@roalson.com"],
    ["someone@example.org", "mailto:someone@example.org"],
    ["210-496-5800", "tel:2104965800"],
    ["(210) 496-5800", "tel:2104965800"],
    ["+1 210 496 5800", "tel:+12104965800"],
  ])("%s is an address or a number, not a route: %s", (input, expected) => {
    expect(sitePath(input)).toBe(expected);
  });

  it("does not take a short number or a credentialed URL for either", () => {
    expect(sitePath("2026")).toBe("/2026");
    expect(sitePath("https://user:secret@example.com/")).toBe("https://user:secret@example.com/");
    expect(sitePath("https://mhoward@roalson.com/contact")).toBe("/contact");
  });

  it.each([
    "https://example.com/contact",
    "https://www.loopnet.com/Listing/25331-W-Interstate-10/",
    // A look-alike is not this site.
    "https://roalson.com.example.org/contact",
    "https://notroalson.com/contact",
    // Dotless, but a real place to a developer — and never an editor's path.
    "http://localhost:5173/contact",
    "https://staging:8443/contact",
    "https://www.roalson.com:8443/contact",
    "mailto:info@example.com",
    "tel:+12104965800",
    "#footer-nav",
    "//cdn.example.com/file.pdf",
  ])("%s is left exactly as written", (input) => {
    expect(sitePath(input)).toBe(input);
  });

  it("gives a bare domain its scheme rather than treating it as a route", () => {
    expect(sitePath("example.com/listing")).toBe("https://example.com/listing");
    expect(sitePath("www.roalson.com/contact")).toBe("/contact");
  });

  it("takes the site's hosts as an argument, so a second domain is one edit", () => {
    expect(sitePath("https://roalsoninterests.com/contact")).toBe(
      "https://roalsoninterests.com/contact",
    );
    expect(sitePath("https://roalsoninterests.com/contact", ["roalsoninterests.com"])).toBe(
      "/contact",
    );
  });
});

describe("cmsHref — a Prismic Link field as an href", () => {
  it("reduces a Web link that means a route on this site", () => {
    expect(cmsHref(web("https:///contact"), { linkResolver })).toBe("/contact");
    expect(cmsHref(web("https://www.roalson.com/properties"), { linkResolver })).toBe(
      "/properties",
    );
  });

  it("leaves a real external URL alone", () => {
    expect(cmsHref(web("https://example.com/a?b=1"), { linkResolver })).toBe(
      "https://example.com/a?b=1",
    );
  });

  it("resolves a document link through the resolver — the routes-free client fills no url (#10)", () => {
    const doc = {
      link_type: "Document",
      id: "x",
      type: "property",
      uid: "25331-ih-10-west",
      tags: [],
      lang: "en-us",
      isBroken: false,
    } as unknown as LinkField;
    expect(cmsHref(doc, { linkResolver })).toBe("/properties/25331-ih-10-west");
  });

  it("passes a media link through", () => {
    const media = {
      link_type: "Media",
      kind: "document",
      id: "m",
      name: "package.pdf",
      size: "1",
      url: "https://roalson-interests.cdn.prismic.io/roalson-interests/package.pdf",
    } as unknown as LinkField;
    expect(cmsHref(media, { linkResolver })).toBe(
      "https://roalson-interests.cdn.prismic.io/roalson-interests/package.pdf",
    );
  });

  it.each([
    ["an empty field", { link_type: "Any" }],
    ["a Web link with no url", { link_type: "Web", url: "" }],
    ["a Web link of whitespace", { link_type: "Web", url: "   " }],
    [
      "a document the resolver does not know",
      { link_type: "Document", id: "y", type: "form_replies", tags: [], lang: "en-us" },
    ],
    ["null", null],
    ["undefined", undefined],
  ])("%s is null, so the caller renders no anchor", (_name, field) => {
    expect(cmsHref(field as unknown as LinkField, { linkResolver })).toBeNull();
  });
});
