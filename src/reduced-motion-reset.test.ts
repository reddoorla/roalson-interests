import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolved from the project root: under jsdom this module is served over http,
// so `new URL(..., import.meta.url)` is not a file: URL.
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const reset = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

/** The time `property` is forced to under reduce, in ms. */
const forced = (property: string) => {
  const m = new RegExp(`(?<![\\w-])${property}:\\s*([\\d.]+)(m?s)\\s*!important`).exec(reset);
  expect(m, `${property} is not forced under reduce`).not.toBeNull();
  return Number(m![1]) * (m![2] === "s" ? 1000 : 1);
};

describe("the reduced-motion reset", () => {
  // Zeroing durations but not delays leaves "nothing happens, then it pops" —
  // worse than the motion it replaced. A staggered reveal waits out its full
  // cascade and then snaps in.
  it("zeroes delays as well as durations", () => {
    for (const property of [
      "animation-duration",
      "animation-delay",
      "transition-duration",
      "transition-delay",
    ]) {
      expect(forced(property), property).toBeLessThan(1);
    }
  });
});
