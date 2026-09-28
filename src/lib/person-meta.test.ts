import { describe, expect, it } from "vitest";

import { personMeta } from "./person-meta";
import { personFixture } from "./person-fixture";

const url = new URL("https://www.roalson.com/preview/team/matt-howard?utm_source=email");

describe("personMeta", () => {
  it("noindexes a placeholder biography — and only a placeholder", () => {
    expect(personMeta(personFixture(), url).noindex).toBe(true);
    expect(personMeta(personFixture({ bio_is_placeholder: false }), url).noindex).toBe(false);
  });

  it("describes the person by name and title when the editor wrote nothing", () => {
    expect(personMeta(personFixture(), url).meta_description).toBe(
      "Matt Howard, Partner at Roalson Interests — San Antonio commercial real estate.",
    );
    const p = personFixture({ meta_description: "Hand-written." });
    expect(personMeta(p, url).meta_description).toBe("Hand-written.");
  });

  it("emits a schema.org Person with only the fields that are filled", () => {
    const full = personMeta(personFixture(), url).jsonLd;
    expect(full).toMatchObject({
      "@type": "Person",
      name: "Matt Howard",
      jobTitle: "Partner",
      worksFor: { "@type": "Organization", name: "Roalson Interests" },
      url: "https://www.roalson.com/team/matt-howard",
      email: "mhoward@roalson.com",
      telephone: "+12104965800",
    });
    expect(full).not.toHaveProperty("image");
    const bare = personMeta(personFixture({ email: "n/a", phone: null, role: null }), url).jsonLd;
    expect(bare).not.toHaveProperty("email");
    expect(bare).not.toHaveProperty("telephone");
    expect(bare).not.toHaveProperty("jobTitle");
  });
});
