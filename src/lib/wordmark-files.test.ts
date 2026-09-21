import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The bar cross-fades two files in one box: `logo.svg` (RI Wordmark
 * Garnet_Dust, 6788:3778) and `logo-reverse.svg` (RI Wordmark Reverse,
 * 6788:3777). Figma's two exports were diffed when the second was added and
 * differ ONLY in fill, so the reverse file is the first with its fills swapped.
 * If one is ever replaced without the other, the wordmark shifts or changes
 * shape as the bar takes its ground — this is what says so.
 */
const read = (name: string) => readFileSync(resolve(process.cwd(), "static", name), "utf8");
const paths = (svg: string) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
const fills = (svg: string) =>
  [
    ...new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1].toLowerCase())),
  ].sort();
const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)?.[1];

describe("the two wordmark files", () => {
  const garnet = read("logo.svg");
  const reverse = read("logo-reverse.svg");

  it("are the same drawing", () => {
    expect(paths(garnet).length).toBe(8);
    expect(paths(reverse)).toEqual(paths(garnet));
    expect(viewBox(reverse)).toBe(viewBox(garnet));
    expect(viewBox(garnet)).toBe("0 0 383 123");
  });

  it("differ only in fill: garnet + dust, and white + sand", () => {
    expect(fills(garnet)).toEqual(["#652323", "#b2ac9f"]);
    expect(fills(reverse)).toEqual(["#e8e1d1", "#ffffff"]);
  });
});
