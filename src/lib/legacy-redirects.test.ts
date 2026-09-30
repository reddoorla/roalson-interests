import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LEGACY_PATHS, TREC_CPN, TREC_IABS, legacyRedirect } from "./legacy-redirects";

const root = join(import.meta.dirname, "../..");
const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8"));

/** Every URL the old www.roalson.com answered for, as its own links spell them. */
const inventory: string[] = read("tests/smoke/legacy-urls.json").paths;
const seed: { uid: string; assets: { package_pdf: { url: string } } }[] = read(
  "scripts/seed/listings.json",
);
const published = Object.keys(read("scripts/seed/listings.state.json").documents);

/** The page or file behind a target, in this repo. */
function exists(target: string): boolean {
  if (target === "/") return existsSync(join(root, "src/routes/[[preview=preview]]/+page.svelte"));
  if (target === "/properties")
    return existsSync(join(root, "src/routes/[[preview=preview]]/properties/+page.svelte"));
  if (target === "/contact") return existsSync(join(root, "src/routes/contact/+page.svelte"));
  const listing = /^\/properties\/([^/]+)$/.exec(target)?.[1];
  if (listing)
    return (
      published.includes(listing) &&
      existsSync(join(root, "src/routes/[[preview=preview]]/properties/[uid]/+page.svelte"))
    );
  return /^\/[^/]+\.pdf$/.test(target) && existsSync(join(root, "static", target));
}

describe("legacyRedirect", () => {
  it("sends every URL the old site answered for somewhere that exists here", () => {
    expect(inventory.length).toBeGreaterThan(80);
    const lost = inventory.filter((path) => {
      const to = legacyRedirect(path);
      return to === null || !exists(to);
    });
    expect(lost).toEqual([]);
  });

  it("sends each listing's old package to that listing's page, as the seed pairs them", () => {
    expect(seed).toHaveLength(22);
    for (const { uid, assets } of seed) {
      expect(legacyRedirect(new URL(assets.package_pdf.url).pathname), uid).toBe(
        `/properties/${uid}`,
      );
    }
  });

  it("sends pages to their counterparts and the TREC forms to this site's copies", () => {
    expect(legacyRedirect("/contact_us.htm")).toBe("/contact");
    expect(legacyRedirect("/prop.htm")).toBe("/properties");
    expect(legacyRedirect("/About%20Us.html")).toBe("/");
    expect(legacyRedirect("/IABS%20Roalson%20Form%202026.pdf")).toBe(TREC_IABS);
    expect(legacyRedirect("/CPN4.pdf")).toBe(TREC_CPN);
    // Another year's form, and a package for a listing this site never carried.
    expect(legacyRedirect("/IABS%20Roalson%20Form%202025.pdf")).toBe(TREC_IABS);
    expect(legacyRedirect("/props/Columbia_Square/Columbia%20Square%20package.pdf")).toBe(
      "/properties",
    );
  });

  it("matches whatever case and encoding the link was typed in", () => {
    expect(legacyRedirect("/PROP.HTM")).toBe("/properties");
    expect(legacyRedirect("/about us.html")).toBe("/");
    expect(legacyRedirect("/props/riverwalk/riverwalk%20PACKAGE.pdf")).toBe(
      "/properties/st-marys-at-martin-river-walk",
    );
  });

  it("leaves every path of this site alone, its targets included, so nothing loops", () => {
    const own = [
      "/",
      "/properties",
      "/properties/5001-walzem-road",
      "/contact",
      "/team/matt-howard",
      "/health",
      "/sitemap.xml",
      "/dev/home",
      "/_app/immutable/entry/start.js",
      TREC_IABS,
      TREC_CPN,
      ...new Set(Object.values(LEGACY_PATHS)),
    ];
    for (const path of own) expect(legacyRedirect(path), path).toBeNull();
  });

  it("answers null, not a throw, for a path that does not decode", () => {
    expect(legacyRedirect("/%E0%A4%A.htm")).toBeNull();
  });
});
