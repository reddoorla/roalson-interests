// @vitest-environment node
//
// THE BROWSER SPECS TIME THE BAND OFF THE SLICE'S OWN NUMBERS. A Playwright
// spec cannot import a .svelte module, so tests/interaction/featured-dwell.ts
// PARSES DWELL and KEN_BURNS out of index.svelte's source, and every curve
// featured-properties.spec.ts and featured-band-live.spec.ts check — where the
// photo should be on a frame, how far short of the end scale it may land — is
// computed from what it parsed. Parsed wrong, they would time a band that does
// not exist and could pass doing it. The node environment because the parser
// resolves the slice from its own `import.meta.url`, which jsdom's is not.
import { describe, expect, it } from "vitest";

import { FEATURED_DWELL, FEATURED_KEN_BURNS } from "../../../../tests/interaction/featured-dwell";
import { DWELL, KEN_BURNS } from "./index.svelte";

describe("tests/interaction/featured-dwell.ts", () => {
  it("parses the numbers the slice exports", () => {
    expect(FEATURED_KEN_BURNS, "KEN_BURNS").toBe(KEN_BURNS);
    expect(FEATURED_DWELL, "DWELL").toBe(DWELL);
  });
});
