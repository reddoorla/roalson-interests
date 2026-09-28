import { describe, expect, it } from "vitest";

import { emailHref, isPlaceholderBio, personDisplayName, phoneHref } from "./person";
import { personFixture } from "./person-fixture";

describe("phoneHref", () => {
  it("dials a ten-digit US number however it is punctuated", () => {
    expect(phoneHref("(210) 496-5800")).toBe("tel:+12104965800");
    expect(phoneHref("210.496.5800")).toBe("tel:+12104965800");
    expect(phoneHref("+1 210 496 5800")).toBe("tel:+12104965800");
  });

  it("answers null — never throws — on anything else", () => {
    expect(phoneHref("496-5800")).toBeNull();
    expect(phoneHref("n/a")).toBeNull();
    expect(phoneHref("210-496-5800 x12")).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });
});

describe("emailHref", () => {
  it("mails one plain address, trimmed", () => {
    expect(emailHref(" mhoward@roalson.com ")).toBe("mailto:mhoward@roalson.com");
  });

  it("answers null on anything that is not one address", () => {
    for (const bad of ["n/a", "mhoward@roalson", "a@b.com, c@d.com", "", null, undefined])
      expect(emailHref(bad), String(bad)).toBeNull();
  });
});

describe("a person", () => {
  it("is a placeholder only when the editor ticked the flag", () => {
    expect(isPlaceholderBio(personFixture())).toBe(true);
    expect(isPlaceholderBio(personFixture({ bio_is_placeholder: false }))).toBe(false);
  });

  it("is named with designations after the name when there are any", () => {
    expect(personDisplayName(personFixture())).toBe("Matt Howard");
    expect(personDisplayName(personFixture({ credentials: " CCIM " }))).toBe("Matt Howard, CCIM");
  });
});
