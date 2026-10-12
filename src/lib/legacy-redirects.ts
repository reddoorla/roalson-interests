// Where the old www.roalson.com's URLs go once this site takes the domain.
//
// The old site is a frameset on GoDaddy; its pages, TREC forms and listing
// packages are bookmarked, emailed and printed, and every one of them would
// 404 here at cutover. Each URL below was found by crawling it read-only from
// / on 2026-09-30 (every frame, every page and PDF they link), and is kept in
// the test as that inventory.
//
// WHY A HOOK AND NOT netlify.toml. adapter-netlify serves the site through
// one function claiming `/*` with `preferStatic`, and Netlify evaluates a
// function's path before redirect rules: any URL that is not a static file
// reaches SvelteKit, so a [[redirects]] rule for /prop.htm would never be read.
// The hook sees exactly those requests, on Netlify and under `vite preview`.
//
// Matched on the decoded path and case-insensitively: the old links carry
// spaces, and a hand-typed "Prop.htm" should land too. None of these can
// shadow a page of this site — every target is one, and none is a key.

export const TREC_IABS = "/texas-information-about-brokerage-services.pdf";
export const TREC_CPN = "/texas-consumer-protection-notice.pdf";

/** Each listing's package on the old site, to its page here — the same
 *  pairing scripts/seed/listings.json records as the package's source. */
const PACKAGES: [string, string][] = [
  ["/props/5001_Walzem_Road/5001 Walzem Road package.pdf", "5001-walzem-road"],
  ["/props/Riverwalk/Riverwalk package.pdf", "st-marys-at-martin-river-walk"],
  ["/props/25331 IH 10 West/25331 IH 10 West.pdf", "25331-ih-10-west"],
  ["/props/Urban_Loop/Urban Loop package.pdf", "urban-loop-road"],
  ["/props/13810_Lookout_Road/13810 Lookout Rd package.pdf", "13810-lookout-road"],
  ["/props/402_W_Nueva_Street/402 W Nueva Street package.pdf", "402-w-nueva-street"],
  [
    "/props/IH10_East_at_Loop_1604-1.34_acre/IH 10 at Loop 1604 (1.34).pdf",
    "ih-10-east-at-loop-1604",
  ],
  [
    "/props/116_Old_San_Antonio_Road/116 Old San Antonio Road package.pdf",
    "116-old-san-antonio-road",
  ],
  ["/props/IH10_at_Menger_Springs/IH 10 at Menger Springs package.pdf", "ih-10-at-menger-springs"],
  [
    "/props/Old_San_Antonio_Road/Old San Antonio Road package.pdf",
    "cascade-caverns-at-old-san-antonio-road",
  ],
  [
    "/props/IH10_at_Scenic_Loop_Rd-2.09_Acres/IH 10 at Scenic Loop (2.09) package.pdf",
    "ih-10-at-scenic-loop",
  ],
  ["/props/IH_10_at_Hwy_46_in_Boerne/IH 10 at Hwy 46 in Boerne package.pdf", "ih-10-at-highway-46"],
  [
    "/props/Menger_Springs-13.4_Acres/Menger Springs - 13.4 Acres package.pdf",
    "menger-springs-road",
  ],
  ["/props/5930_Bandera_Road/5930 Bandera Rd package.pdf", "5930-bandera-road"],
  ["/props/11714_Perrin_Beitel/11714 Perrin Beitel package.pdf", "11714-perrin-beitel-road"],
  [
    "/props/Loop_1604_at_Hwy_181-6.394_Acres/Loop 1604 at Hwy 181 package.pdf",
    "loop-1604-at-highway-181",
  ],
  ["/props/Commerce_at_Main_Ave/Commerce and  Main package.pdf", "101-w-commerce-street"],
  ["/props/3089_IH10_in_Seguin/3089 IH 10 in Seguin package-new.pdf", "ih-10-at-fm-725-seguin"],
  [
    "/props/IH 35 at Wonderworld Drive/IH 35 at Wonderworld Drive package.pdf",
    "ih-35-at-wonderworld-san-marcos",
  ],
  ["/props/IH10_at_Hwy_87_in_Comfort/IH 10 at Hwy 87 package.pdf", "ih-10-at-highway-87-comfort"],
  [
    "/props/Kingsville - Hwy 77 at Gen Cavazos/Kingsville - Hwy 77 at Gen Cavazos package.pdf",
    "highway-77-at-general-cavazos-kingsville",
  ],
  [
    "/props/Loop_1604_at_Dove_Canyon/Loop 1604 at Dove Canyon package.pdf",
    "loop-1604-at-dove-canyon",
  ],
];

/** Exact old paths, decoded, to where they go. */
export const LEGACY_PATHS: Record<string, string> = {
  // The frameset's pages. "About Us" is the homepage's legacy band now; the
  // old staff profiles have no page here.
  "/index.htm": "/",
  "/mainFrame.htm": "/",
  "/topFrame.htm": "/",
  "/About Us.html": "/",
  "/about.htm": "/",
  "/resources2.htm": "/",
  "/links.htm": "/",
  "/prop.htm": "/properties",
  "/SAmap.htm": "/properties",
  "/SAmap2.htm": "/properties",
  "/AVPROP in border.pdf": "/properties",
  "/contact_us.htm": "/contact",
  "/feedback.htm": "/contact",
  // The TREC notices, linked from mainFrame.htm.
  "/IABS Roalson Form 2026.pdf": TREC_IABS,
  "/CPN.pdf": TREC_CPN,
  "/CPN4.pdf": TREC_CPN,
  ...Object.fromEntries(PACKAGES.map(([from, uid]) => [from, `/properties/${uid}`])),
};

/** Whole families, after the exact paths: every other listing package the
 *  old map linked (41 of them, for listings this site does not carry) and its
 *  one listing's sub-pages, the staff profiles, and other years' TREC forms. */
export const LEGACY_PATTERNS: [RegExp, string][] = [
  [/^\/(?:roalson\/)?props\//i, "/properties"],
  [/^\/profiles\//i, "/"],
  [/^\/iabs[^/]*\.pdf$/i, TREC_IABS],
  [/^\/cpn[^/]*\.pdf$/i, TREC_CPN],
];

const EXACT = new Map(Object.entries(LEGACY_PATHS).map(([from, to]) => [from.toLowerCase(), to]));

/** Where an old URL's path goes, or null for a path the old site never had. */
export function legacyRedirect(pathname: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const exact = EXACT.get(path.toLowerCase());
  if (exact) return exact;
  return LEGACY_PATTERNS.find(([re]) => re.test(path))?.[1] ?? null;
}
