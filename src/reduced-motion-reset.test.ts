import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolved from the project root: under jsdom this module is served over http,
// so `new URL(..., import.meta.url)` is not a file: URL.
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");
const reset = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

describe("the reduced-motion reset", () => {
  // Zeroing durations but not delays leaves "nothing happens, then it pops" —
  // worse than the motion it replaced. A staggered reveal waits out its full
  // cascade and then snaps in.
  it("zeroes delays as well as durations", () => {
    expect(reset).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reset).toMatch(/animation-delay:\s*0ms\s*!important/);
    expect(reset).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reset).toMatch(/transition-delay:\s*0ms\s*!important/);
  });
});
