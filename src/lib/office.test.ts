import { describe, expect, it } from "vitest";
import {
  OFFICE,
  officeAddressLines,
  officeDirectionsUrl,
  officePostalAddress,
  telHref,
} from "./office";
import { organizationJsonLd } from "./seo";

describe("OFFICE", () => {
  // The comp prints "7825" — four digits — on every frame. The client's live
  // site prints 78258. Pinned as a literal on purpose: a session that
  // "corrects" the module back to the design has to come here and read why.
  it("carries the client's five-digit ZIP, not the comp's four", () => {
    expect(OFFICE.postalCode).toBe("78258");
    expect(OFFICE.postalCode).toMatch(/^\d{5}$/);
  });

  it("prints the address as the comp's three lines", () => {
    expect(officeAddressLines()).toEqual([
      "17721 Rogers Ranch Parkway",
      "Suite 125",
      "San Antonio, TX 78258",
    ]);
  });

  it("dials the number it prints", () => {
    expect(OFFICE.phone.display).toBe("(210) 496-5800");
    expect(OFFICE.phone.href).toBe("tel:+12104965800");
    // The relationship, not just the two literals: whatever is printed is
    // what is dialled.
    expect(OFFICE.phone.href.replace(/\D/g, "")).toBe(
      `1${OFFICE.phone.display.replace(/\D/g, "")}`,
    );
  });

  it("keeps the fax the live site prints, which nothing renders yet", () => {
    expect(OFFICE.fax.display).toBe("(210) 496-5809");
  });
});

describe("telHref", () => {
  it("turns a printed US number into an E.164 tel: link", () => {
    expect(telHref("(210) 496-5800")).toBe("tel:+12104965800");
    expect(telHref("210.496.5800")).toBe("tel:+12104965800");
  });

  it("refuses a number that is not ten digits, rather than link to nowhere", () => {
    expect(() => telHref("(210) 496-580")).toThrow(/ten-digit/);
    expect(() => telHref("1 (210) 496-5800")).toThrow(/ten-digit/);
  });
});

describe("officePostalAddress", () => {
  it("is the shape organizationJsonLd takes, suite included", () => {
    const jsonLd = organizationJsonLd({
      name: "Roalson Interests",
      url: "https://example.com",
      address: officePostalAddress(),
    }) as { address: Record<string, string> };
    expect(jsonLd.address).toEqual({
      "@type": "PostalAddress",
      addressCountry: "US",
      streetAddress: "17721 Rogers Ranch Parkway, Suite 125",
      addressLocality: "San Antonio",
      addressRegion: "TX",
      postalCode: "78258",
    });
  });
});

describe("officeDirectionsUrl", () => {
  it("is a keyless Google Maps search for the building", () => {
    const url = new URL(officeDirectionsUrl());
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe("17721 Rogers Ranch Parkway, San Antonio, TX 78258");
  });
});
