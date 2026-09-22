import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chooseFeatureImage,
  locate,
  pageCandidates,
  parseImageList,
  // @ts-expect-error — plain ESM scripts, no declarations
} from "./feature-images.mjs";

type Entry = {
  uid: string;
  data: Record<string, unknown>;
  assets: {
    package_pdf: { url: string };
    feature_image?: {
      url?: string;
      filename: string;
      alt: string;
      source?: {
        pdf: string;
        page: number;
        object: number;
        width: number;
        height: number;
        rotate: number;
      };
    };
  };
};

const listings = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/seed/listings.json"), "utf8"),
) as Entry[];

/** `pdfimages -list` on 13810 Lookout Road's package, verbatim, trimmed to the
 *  first four pages. Object 389 is the letterhead — it is drawn on every page,
 *  which is the whole signal. */
const LOOKOUT_ROAD = `page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio
--------------------------------------------------------------------------------------------
   1     0 image    1275  1643  icc     3   8  image  no       389  0   151   151  158K 2.6%
   1     1 image    1717   866  rgb     3   8  jpeg   no       396  0   301   302  106K 2.4%
   2     2 image    1275  1643  icc     3   8  image  no       389  0   151   151  158K 2.6%
   3     3 image    1275  1643  icc     3   8  image  no       389  0   151   151  158K 2.6%
   3     4 image     821   733  rgb     3   8  jpeg   no         9  0   123   123  133K 7.5%
   4     5 image    1052   765  rgb     3   8  jpeg   no        12  0   152   152  159K 6.7%
`;

describe("parseImageList", () => {
  it("reads one row per placement and keeps the object id, which is what identifies the template", () => {
    const rows = parseImageList(LOOKOUT_ROAD);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual({
      page: 1,
      num: 1,
      type: "image",
      width: 1717,
      height: 866,
      enc: "jpeg",
      object: 396,
    });
    // The same letterhead, three placements, one object id.
    expect(rows.filter((r: { object: number }) => r.object === 389)).toHaveLength(3);
  });

  it("keeps nothing out of the header, the rule, or a poppler warning", () => {
    expect(parseImageList("")).toEqual([]);
    expect(
      parseImageList(
        "page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio\n" +
          "-------------------------------------------\n" +
          "Syntax Warning: Invalid Font Weight\n",
      ),
    ).toEqual([]);
  });
});

describe("chooseFeatureImage", () => {
  const rows = parseImageList(LOOKOUT_ROAD);

  it("discards the image drawn on another page — that is the letterhead — and takes the largest left", () => {
    const pick = chooseFeatureImage(rows, 1);
    expect(pick.object).toBe(396);
    // Not merely "the biggest on page 1": the letterhead is 1275×1643 =
    // 2,094,825px against the photo's 1717×866 = 1,486,922, so size alone
    // picks the wrong one and the repeat test is what saves it.
    expect(1275 * 1643).toBeGreaterThan(1717 * 866);
  });

  it("finds nothing on a page that holds only the template", () => {
    expect(chooseFeatureImage(rows, 2)).toBeNull();
  });

  it("reads any page, not just the first — seventeen of the 22 packages open on typed text", () => {
    expect(chooseFeatureImage(rows, 3).object).toBe(9);
    expect(chooseFeatureImage(rows, 4).object).toBe(12);
  });

  it("ranks the survivors largest first", () => {
    const two = parseImageList(
      `   1     0 image     800   600  rgb     3   8  jpeg   no        40  0   150   150  10K 1%
   1     1 image    1200   900  rgb     3   8  jpeg   no        41  0   150   150  10K 1%
   2     2 image     100   100  rgb     3   8  jpeg   no        99  0   150   150  10K 1%
`,
    );
    expect(pageCandidates(two, 1).map((r: { object: number }) => r.object)).toEqual([41, 40]);
  });

  it("never offers an smask — that is another image's alpha channel, not an image", () => {
    const masked = parseImageList(
      `   1     0 smask    2000  2000  gray    1   8  image  yes      55  0   300   300  8K 1%
   1     1 image     900   600  rgb     3   8  jpeg   no       56  0   300   300  90K 9%
`,
    );
    expect(chooseFeatureImage(masked, 1).object).toBe(56);
  });
});

describe("locate", () => {
  const rows = parseImageList(LOOKOUT_ROAD);
  const source = { page: 1, object: 396, width: 1717, height: 866 };

  it("returns the recorded image", () => {
    expect(locate(rows, source).num).toBe(1);
  });

  it("refuses when the object moved, so a republished package cannot silently swap the photo", () => {
    expect(() => locate(rows, { ...source, object: 400 })).toThrow(/no longer holds object 400/);
    expect(() => locate(rows, { ...source, width: 1718 })).toThrow(/1718x866/);
    expect(() => locate(rows, { ...source, page: 9 })).toThrow(/no images/);
  });
});

describe("the photographs recorded for the listings", () => {
  const withSource = listings.filter((l) => l.assets.feature_image?.source);

  it("names a package page and object for every photo lifted out of a PDF, and its size", () => {
    expect(withSource.length).toBe(20);
    for (const l of withSource) {
      const { filename, alt, source } = l.assets.feature_image!;
      expect(filename, l.uid).toBe(`${l.uid}-feature.jpg`);
      expect(source!.pdf, l.uid).toBe("package_pdf");
      expect(source!.page, l.uid).toBeGreaterThan(0);
      expect(source!.width, l.uid).toBeGreaterThan(0);
      expect(source!.height, l.uid).toBeGreaterThan(0);
      expect([0, 90, 180, 270], l.uid).toContain(source!.rotate);
      // Alt text a screen reader gets instead of the photo: written from
      // looking at it, so it is never the title back again.
      expect(alt.length, l.uid).toBeGreaterThan(40);
      expect(alt, l.uid).not.toBe(l.data.title);
    }
  });

  it("gives each photo its own filename and its own alt", () => {
    const named = listings.filter((l) => l.assets.feature_image);
    expect(new Set(named.map((l) => l.assets.feature_image!.filename)).size).toBe(named.length);
    expect(new Set(named.map((l) => l.assets.feature_image!.alt)).size).toBe(named.length);
  });

  it("leaves exactly one listing without a photo, and that is a decision, not an oversight", () => {
    // loop-1604-at-highway-181's package has no photograph of the site: its
    // two aerial pages are a metro-wide view where the property is a few
    // pixels, and a Pape-Dawson site-plan drawing. A listing with no photo is
    // the status quo; a listing with the wrong one is worse.
    expect(listings.filter((l) => !l.assets.feature_image).map((l) => l.uid)).toEqual([
      "loop-1604-at-highway-181",
    ]);
  });
});
