import { describe, expect, it } from "vitest";
import type * as prismic from "@prismicio/client";
import { createClient, linkResolver } from "./prismicio";

const doc = (type: string, uid: string) =>
  ({
    link_type: "Document",
    type,
    uid,
  }) as unknown as prismic.FilledContentRelationshipField;

describe("createClient", () => {
  // Prismic rejects every query on a client whose routes config names a type
  // with no documents in the repo yet — a freshly cloned repo has none. A
  // routes-free client sidesteps that entirely (see module comment).
  it("creates a routes-free client", () => {
    expect(createClient().routes).toBeUndefined();
  });
});

// linkResolver is the local stand-in for Prismic's routes resolver (see the
// comment on the routes-free client in ./prismicio.ts): page documents map to
// "/" for home and "/<uid>" otherwise; anything else is unresolvable.
describe("linkResolver", () => {
  it("resolves the home page doc to the root path", () => {
    expect(linkResolver(doc("page", "home"))).toBe("/");
  });

  it("resolves other page docs to /:uid", () => {
    expect(linkResolver(doc("page", "our-team"))).toBe("/our-team");
  });

  it("returns null for non-page types", () => {
    expect(linkResolver(doc("person", "dr-quan"))).toBeNull();
    expect(linkResolver(doc("settings", "x"))).toBeNull();
  });
});
