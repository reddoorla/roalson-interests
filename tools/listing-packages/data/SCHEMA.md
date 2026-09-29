# Listing JSON schema (one file per listing: data/<uid>.json)

Transcribe VERBATIM from the original package PDF. Never invent, round, or "improve" facts.
Only normalize: ALL-CAPS headings -> Title Case for `title`/`eyebrow`, collapse hard line wraps,
straighten nothing else. Keep the broker's wording, numbers, punctuation and typos (list typos in `qa_notes`).

```json
{
  "uid": "loop-1604-at-dove-canyon",
  "variant": "land", // "land" or "existing" (existing = improved property with a building)
  "transaction": "For Sale", // "For Sale" | "For Lease" | "For Sale or Lease" (from the PDF; if the PDF never says, use "For Sale" and note it)
  "type_label": "Land", // cover chip after the divider: "Land" or "Existing Property"
  "eyebrow": "Commercial Development Site", // the headline/tagline above the address on the original cover (Title Case); "" if none
  "title": "Loop 1604 at Dove Canyon", // property name / cross streets / address, Title Case, keep numbers exactly
  "city": "San Antonio, Texas", // City, State as printed (spell out Texas if abbreviated "TX" -> keep as printed but note)
  "size_headline": "13.33 Acres", // if the cover shows a size line, else ""
  "rows": [
    // EVERY labelled row on the spec pages, in original order, EXCEPT Comments
    { "label": "Location", "text": "The property is located at ..." },
    { "label": "Size", "text": "13.33 +/- Acres" },
    {
      "label": "Frontage",
      "pairs": [
        ["Loop 1604", "1,227 feet"],
        ["Dove Canyon", "688 feet"]
      ]
    },
    {
      "label": "Utilities",
      "pairs": [
        ["Electricity", "Available"],
        ["Sewer", "Available"],
        ["Water", "Available"],
        ["Gas", "Available"]
      ],
      "note": "Prospective buyers should retain an independent engineer to verify the location, accessibility and capacity of all utilities."
    },
    {
      "label": "Zoning",
      "text": "OCL, San Antonio ETJ",
      "note": "Prospective buyers should verify the zoning and permitted uses for this property with the appropriate governing authority."
    },
    {
      "label": "Demographics",
      "table": {
        "columns": ["", "1.0 Miles", "3.0 Miles", "5.0 Miles"],
        "rows": [
          ["Population, 2025 Estimate", "18,042", "129,967", "246,328"],
          ["Population, 5 Year Projection", "20,154", "143,376", "271,074"],
          ["Average Household Income", "$106,524", "$106,769", "$104,858"]
        ]
      },
      "note": "Source: U.S. Bureau of the Census, 2020 Census of Population and Housing. ESRI forecasts for 2025 and 2030."
    },
    { "label": "Investment", "text": "$4,935,565.80 or $8.50 per square foot" }
  ],
  // A row has "text" and/or "pairs" and/or "table", plus optional "note" (the small italic disclaimer under it).
  // Keep the original label wording ("Investment" vs "Pricing", "Deed Restrictions", "Area Development", ...).
  "comments": ["Exceptional growth continues on ...", "Excellent visibility"], // bullet items, verbatim
  "contact": {
    "names": "Bart Wilson or Matt Howard", // exact order as printed
    "phone": "(210) 496-5800",
    "fax": "", // only if printed
    "emails": ["bwilson@roalson.com", "mhoward@roalson.com"], // order as printed
    "web": "www.roalson.com"
  },
  "demographic_overview": {
    // the full ESRI "DEMOGRAPHIC OVERVIEW" page; null if the PDF has none
    "title": "Loop 1604 at Dove Canyon", // the site name printed on that page (Title Case)
    "date": "September 25, 2025",
    "columns": ["1.0 Miles", "3.0 Miles", "5.0 Miles"],
    "sections": [
      {
        "heading": "Population",
        "rows": [
          ["2020 Census", "18,037", "114,406", "215,120"],
          ["2025 Estimate", "...", "...", "..."]
        ]
      },
      { "heading": "Households", "rows": [["2020 Census", "..."]] }
    ],
    "source": "Source: U.S. Bureau of the Census, 2020 Census of Population and Housing. ESRI forecasts for 2025 and 2030.",
    "from_image": false // true if you had to read it off a rendered image (then double-check every digit)
  },
  "pages": [
    // one entry per ORIGINAL page, in order
    { "page": 1, "kind": "cover_spec", "caption": "" },
    { "page": 2, "kind": "spec", "caption": "" },
    { "page": 3, "kind": "location_map", "caption": "Location Map" },
    { "page": 4, "kind": "area_map", "caption": "Area Map" },
    {
      "page": 5,
      "kind": "aerial",
      "caption": "Aerial Map",
      "annotations": "site outlined in red, labels Loop 1604 / 13.33 Acres, FEMA floodplain shaded cyan"
    },
    { "page": 7, "kind": "survey", "caption": "Survey" },
    { "page": 8, "kind": "demographics", "caption": "" },
    { "page": 9, "kind": "disclosure", "caption": "" },
    { "page": 10, "kind": "iabs", "caption": "" }
  ],
  // kind is one of: cover_spec, spec, location_map, area_map, aerial, survey, site_plan, floor_plan,
  //   photo_exterior, photo_interior, photo, demographics, disclosure, iabs, other
  // caption = the heading printed on that page (e.g. "Site Plan Exhibit", "Aerial Map"), "" if none.
  // For image-only pages (no extractable text) LOOK at the render to classify them and describe annotations.
  "qa_notes": [
    // anything a human should know: typos, contradictions between pages,
    "Cover says 13.33 acres; Prismic size_label says 13.33 acres (match)" // mismatches with prismic.json, unreadable digits, etc.
  ]
}
```
