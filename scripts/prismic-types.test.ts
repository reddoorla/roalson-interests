import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OUT, renderTypes } from "./prismic-types.mjs";

const ROOT = join(import.meta.dirname, "..");

describe("the generated Prismic types", () => {
  it("are current with every committed model", async () => {
    // A model edited as JSON (which is how this repo delivers them — through
    // CI, never Slice Machine's Push) does not rewrite the types. Without this,
    // the first sign is a field that type-checks against a shape Prismic no
    // longer sends. It already happened once: form_replies shipped upstream
    // with no generated type at all.
    expect(
      readFileSync(join(ROOT, OUT), "utf8"),
      `${OUT} is stale — node scripts/prismic-types.mjs`,
    ).toBe(await renderTypes());
  });

  it("types every custom type, including the one that was missing", async () => {
    const types = await renderTypes();
    for (const doc of ["PageDocument", "FormRepliesDocument", "PropertyDocument"])
      expect(types, `${doc} missing`).toContain(`export type ${doc}<`);
  });
});
