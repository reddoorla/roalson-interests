# QA report — batch B (2026-09-29)

An independent agent reviewed every page of the first build (17:42) against
the original PDFs for 11 listings: Hwy 46, Comfort, IH 10 at Menger Springs,
Scenic Loop, IH 10 East at 1604, Wonderworld, Dove Canyon, Hwy 181, Menger
Springs Road, St. Mary's, Urban Loop.

## Method

- Text was extracted from both PDFs and word-diffed. Numbers were compared
  token by token.
- Comfort's demographics were read by eye at 170 dpi, because they were only an
  image in the original.
- The TREC page was compared in code. The QR codes were decoded with zxing-cpp.
- Scale bars and pin placement were checked against the parcel geometry, and
  against the originals' own scale bars using road junctions as anchors.

## Passed everywhere

- Every labelled fact on the original spec pages is on the new pages.
- The demographic tables match number for number.
- The "N OF M" footers count the TREC page.
- The TREC page text is identical to the original in all 11.
- The QR codes decode to the printed URL.

## Findings and status

| #   | Sev  | Finding                                                                                                                                                                                        | Status                                                                                                                                                          |
| --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | HIGH | Every scale bar reads 2× the true distance. `maps.mjs` used the 256-px tile constant; MapLibre zooms on 512-px tiles. Measured on the Hwy 46 tract: 654 ft wide, "250 FT" bar ≈ 1,290 ft.      | Fixed: constant 78271.51696, all maps re-rendered.                                                                                                              |
| S2  | HIGH | Frontage-road stations (TxDOT ids ending NBSR/SBSR/EBSR/WBSR) labelled as the freeway; mainline counts dropped (Wonderworld "11,773 IH 35" vs 122,403 mainline; Scenic Loop's 51,699 missing). | Fixed: frontage stations labelled "Frontage Rd" and dropped when a mainline station on the same road is within 700 m; station choice ranks volume by proximity. |
| S3  | MED  | The facts row showed the highest counts while the caption said "nearest".                                                                                                                      | Fixed: the three nearest named stations, with distance.                                                                                                         |
| S4  | MED  | The traffic map was cropped by its frame, so the scale bar was empty and the OSM credit cut off. No page carried an OSM credit.                                                                | Fixed: rendered at the frame's aspect; OSM credit in every map caption.                                                                                         |
| S5  | MED  | Label collisions: traffic callouts stacked, SITE tags covering POI and road labels.                                                                                                            | Fixed: callouts placed by collision search with leader lines; invisible collision blockers hide basemap labels under tags.                                      |
| S6  | MED  | The "Downtown San Antonio" box half-covered the city label.                                                                                                                                    | Fixed by the same blockers.                                                                                                                                     |
| S7  | HIGH | QR / listing URLs 404 today; the new site is not live on roalson.com.                                                                                                                          | Open: resolves at cutover (#209).                                                                                                                               |
| S8  | LOW  | The spec page quotes the original 2024 counts; the exhibit shows 2025.                                                                                                                         | Captioned: "The specification pages quote the counts in the original package."                                                                                  |
| 1   | HIGH | IH 10 East: the pin sat ~120 ft east of the site, on the neighbouring tract.                                                                                                                   | Fixed: moved to 29.4663, −98.2941 per the original aerial and Pape-Dawson exhibit.                                                                              |
| 2   | HIGH | IH 10 East and Urban Loop: page 3 blank except the contact band.                                                                                                                               | Fixed: the flow moves the last row onto the contact page.                                                                                                       |
| 3   | HIGH | Wonderworld: the FEMA page states ~47% in the 100-year area; the 2014 exhibit hatches a strip only.                                                                                            | Open for the broker: current NFHL does cover that much; the percentage is rounded to 45% and flagged in the review notes.                                       |
| 4   | MED  | IH 10 at Menger Springs: Tract 1 missing from the cover and aerial.                                                                                                                            | Fixed: both tracts framed and labelled.                                                                                                                         |
| 5   | MED  | Menger Springs Road: cover title orphan "Sites"; location label truncated.                                                                                                                     | Fixed: eyebrow "Commercial Development Sites", title "Menger Springs" (build/overrides.json).                                                                   |
| 6   | MED  | St. Mary's: title ends on a bare hyphen; location label truncated.                                                                                                                             | Fixed: non-breaking en dash; short map label.                                                                                                                   |
| 7   | MED  | Comfort: lots not labelled on the aerial; the original's lot aerial was dropped.                                                                                                               | Fixed: the original lot aerial is carried over as "Aerial Exhibit — Lots".                                                                                      |
| 8   | MED  | Comfort traffic map cut the site off at the top.                                                                                                                                               | Fixed: traffic bounds include the site polygon.                                                                                                                 |
| 9   | MED  | Urban Loop floor plan filled ~45% of its frame.                                                                                                                                                | Fixed: carried exhibits are cropped to their ink.                                                                                                               |
| 10  | MED  | Dove Canyon: eldon@ → mhoward@ email change not logged.                                                                                                                                        | Logged in the review notes for broker confirmation.                                                                                                             |
| 11  | MED  | Menger Springs Road: 13.36 ac seven-lot site shown as a pin next to a floodway.                                                                                                                | Open: outline from Exhibit A (#211).                                                                                                                            |
| 12  | LOW  | Hwy 181: consider drawing Lot 2 from the site plan.                                                                                                                                            | Open (#211).                                                                                                                                                    |
| 13  | LOW  | Baked-in "AERIAL MAP"/"Survey" badges and a MapRight footer inside carried scans.                                                                                                              | Open, cosmetic.                                                                                                                                                 |
| 14  | LOW  | IH 10 East p10 exhibit softest carried scan (150 dpi source).                                                                                                                                  | Re-extracted at 220 dpi; the source itself is 150 dpi.                                                                                                          |
