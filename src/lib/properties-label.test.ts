import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { sitePath } from "$lib/cms-href";
import { homeFixture } from "$lib/home-fixture";
import { loadSiteConfig } from "$lib/site-config";

// "OUR PORTFOLIO SHOULD ALWAYS JUST BE PROPERTIES, INCLUDING IN THE HAMBURGER
// BUTTON" — the client, 2026-09-25, with "Swap the positions of our portfolio
// and the Contact Us button" in the same breath; and on the comp: "All buttons
// should be PROPERTIES, nothing else."
//
// The label lived in NINE places across four kinds of file — the site config
// (menu, footer CTA, footer list), the seed, the Slice Machine mocks and the
// dev fixtures — and the order in six lists. Fixing them one file at a time
// is how one survives, so this walks every one of those sources and holds the
// rule on all of them at once:
//
//  1. every label whose link reduces to /properties is exactly "Properties";
//  2. wherever /properties and /contact share a list, /properties comes first;
//  3. no label anywhere says "portfolio".
//
// LISTED, on purpose. A walker that stops recognising a shape (a renamed
// `label` key, a mocks format change) finds fewer sites and would otherwise
// pass on nothing; the lists below go red instead.
//
// NOT walked, by the operator's call (D8): the /properties masthead's H1 "Our
// Properties" (a page heading, and Figma's "Option 1" still draws it) and the
// listing page's "All properties" back link. Both are component literals, not
// data. The API id `portfolio_label` stays too — renaming a field id would
// orphan the published value.

type Pair = { label: string; target: string };
type Found = { source: string; lists: Pair[][] };

const root = process.cwd();
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

/** Slice Machine's mock encoding, flattened to the shape the API delivers:
 *  a FieldContent is its value, a LinkContent is `{ url }`, a group item's
 *  `[name, content]` pairs are an object, a group is an array of those. */
function fromMock(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(fromMock);
  if (!node || typeof node !== "object") return node;
  const o = node as Record<string, unknown>;
  switch (o.__TYPE__) {
    case "FieldContent":
      return o.value;
    case "LinkContent":
      return { url: (o.value as { url?: string } | undefined)?.url };
    case "GroupContentType":
      return fromMock(o.value);
    case "GroupItemContent":
      return Object.fromEntries(
        (o.value as [string, unknown][]).map(([name, content]) => [name, fromMock(content)]),
      );
    case "StructuredTextContent":
      return o.value;
    default:
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fromMock(v)]));
  }
}

const urlOf = (link: unknown): string | undefined => {
  if (!link || typeof link !== "object") return undefined;
  const url = (link as { url?: unknown }).url;
  return typeof url === "string" ? url : undefined;
};

/** Every label-and-link pair in a tree, grouped by the list it sits in. Three
 *  shapes: `{ label, href }` (site config), `{ label, link: { url } }` (a CMS
 *  button group), and `X_label` beside `X_link` (a slice's own one button). */
function pairsIn(tree: unknown): Pair[][] {
  const lists: Pair[][] = [];
  const pairOf = (o: Record<string, unknown>): Pair | null => {
    if (typeof o.label !== "string") return null;
    const target = typeof o.href === "string" ? o.href : urlOf(o.link);
    return target === undefined ? null : { label: o.label, target: sitePath(target) };
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      const list = node.flatMap((item) =>
        item && typeof item === "object" ? (pairOf(item as Record<string, unknown>) ?? []) : [],
      );
      if (list.length > 0) lists.push(list);
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      const m = /^(.*)_label$/.exec(key);
      if (!m || typeof o[key] !== "string") continue;
      const target = urlOf(o[`${m[1]}_link`]);
      if (target !== undefined) lists.push([{ label: o[key] as string, target: sitePath(target) }]);
    }
    Object.values(o).forEach(walk);
  };
  walk(tree);
  return lists;
}

function sources(): Found[] {
  const config = loadSiteConfig();
  const found: Found[] = [
    { source: "site-config nav.items", lists: pairsIn(config.nav.items) },
    { source: "site-config footer.cta.links", lists: pairsIn(config.footer.cta?.links ?? []) },
    { source: "site-config footer.nav", lists: pairsIn(config.footer.nav ?? []) },
    { source: "scripts/seed/pages.json", lists: pairsIn(readJson("scripts/seed/pages.json")) },
    { source: "home-fixture homeFixture()", lists: pairsIn(homeFixture()) },
  ];
  const slices = resolve(root, "src/lib/slices");
  for (const name of readdirSync(slices).sort()) {
    const mocks = resolve(slices, name, "mocks.json");
    if (!existsSync(mocks)) continue;
    found.push({
      source: `src/lib/slices/${name}/mocks.json`,
      lists: pairsIn(fromMock(readJson(`src/lib/slices/${name}/mocks.json`))),
    });
  }
  return found;
}

describe('every link to /properties is labelled "Properties", and comes before /contact', () => {
  const found = sources();
  const all = found.flatMap(({ source, lists }) =>
    lists.flatMap((list) => list.map((pair) => ({ source, ...pair }))),
  );
  const toProperties = all.filter((p) => p.target === "/properties");

  it("finds each label site the site has — so the rules below measure something", () => {
    const unmatched = toProperties.map((p) => p.source);
    for (const source of [
      "site-config nav.items",
      "site-config footer.cta.links",
      "site-config footer.nav",
      "scripts/seed/pages.json", // the hero's first button
      "scripts/seed/pages.json", // the featured band's portfolio_label
      "home-fixture homeFixture()", // the hero's first button
      "home-fixture homeFixture()", // the featured band's portfolio_label
      "src/lib/slices/FeaturedProperties/mocks.json",
      "src/lib/slices/HomeHero/mocks.json",
    ]) {
      const i = unmatched.indexOf(source);
      expect(i, `${source}: ${JSON.stringify(toProperties, null, 1)}`).not.toBe(-1);
      unmatched.splice(i, 1);
    }
  });

  it('labels each of them exactly "Properties"', () => {
    for (const pair of toProperties) expect(pair.label, pair.source).toBe("Properties");
  });

  it("puts /properties before /contact in every list that holds both", () => {
    const shared = found.flatMap(({ source, lists }) =>
      lists
        .filter(
          (list) =>
            list.some((p) => p.target === "/properties") &&
            list.some((p) => p.target === "/contact"),
        )
        .map((list) => ({ source, targets: list.map((p) => p.target) })),
    );
    // Six lists pair the two today: the menu, the footer CTA, the footer list,
    // and the hero's buttons in the seed, the fixture and the mock.
    expect(shared.map((s) => s.source)).toEqual(
      expect.arrayContaining([
        "site-config nav.items",
        "site-config footer.cta.links",
        "site-config footer.nav",
        "scripts/seed/pages.json",
        "home-fixture homeFixture()",
        "src/lib/slices/HomeHero/mocks.json",
      ]),
    );
    for (const { source, targets } of shared) {
      expect(targets.indexOf("/properties"), `${source}: ${targets.join(", ")}`).toBeLessThan(
        targets.indexOf("/contact"),
      );
    }
  });

  it('says "portfolio" in no label, wherever it points', () => {
    expect(all.length).toBeGreaterThan(toProperties.length);
    expect(all.filter((p) => /portfolio/i.test(p.label))).toEqual([]);
  });
});
