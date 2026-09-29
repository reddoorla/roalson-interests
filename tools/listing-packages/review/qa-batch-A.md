# QA report — batch A (2026-09-29)

An independent agent reviewed the 19:14 rebuild against the original PDFs for
11 listings: 101 W. Commerce, 116 Old SA Rd, 11714 Perrin Beitel, 13810
Lookout, 25331 IH 10 W, 402 W. Nueva, 5001 Walzem, 5930 Bandera, Cascade
Caverns, Kingsville, Seguin. It checked seven listings page by page, and for
the other four (101, 116, 25331, Kingsville) only the map pages and the text.
It skipped the batch-wide items already fixed after batch B.

## Passed on all 11

- Every number on the original spec and demographic pages is in the new text,
  except the logged corrections.
- The "N of M" footers count the TREC page.
- The TREC text is identical to the original's.
- The outline or pin sits where the original aerial puts the site.

## Findings and status

| Sev  | Listing          | Finding                                                                                               | Status                                                                              |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| HIGH | Cascade Caverns  | Dimensions row garbled: an empty-label pair collapsed the grid (same latent bug in IH 10 at Menger).  | Fixed: empty labels render as an empty cell.                                        |
| HIGH | 25331 IH 10 W    | New FEMA page states ~40% in the 100-year area; the original has no flood statement.                  | Open for the broker; top of the review notes.                                       |
| HIGH | 5001 Walzem      | New FEMA page states 5% floodway / 7% 100-year / 55% 500-year on an investment sale; original silent. | Open for the broker; top of the review notes.                                       |
| MED  | 101 W. Commerce  | Contact email changed from printed eldon@ to the named brokers' addresses.                            | Logged in the review notes for confirmation.                                        |
| MED  | 101, 13810, 5001 | Aerials over-zoomed on tiny lots (z19.2), visibly upsampled.                                          | Fixed: aerial and cover zoom capped at 18.                                          |
| MED  | 116 Old SA Rd    | Outline joins 3 parcels, 18.0 ac GIS against 17.2 ac advertised.                                      | Kept: it matches the broker's own outline; captions say "approximate".              |
| MED  | 11714 Perrin     | Street number missing from cover, spec and pin.                                                       | Fixed: title "11714 Perrin Beitel Road" (overrides).                                |
| MED  | 13810 Lookout    | Cover shows the source's black 3-px borders and crops off the overhead door.                          | Fixed: 6 px trimmed, crop biased right.                                             |
| MED  | 13810 Lookout    | Disclosure dropped "or TENANT" on a lease package.                                                    | Fixed: lease packages read "PURCHASER or TENANT".                                   |
| MED  | 25331 IH 10 W    | "176,539" without $ in the demographics.                                                              | Fixed (scoped correction). "2024 Household Income" left as printed.                 |
| MED  | 25331 IH 10 W    | Floor plan title block "32255 IH 10 WEST"; 10,000 sf offered vs 7,574 sf shown available.             | Open for the broker; in the review notes.                                           |
| MED  | 402 W. Nueva     | Title "402 Nueva Street" vs "402 W. Nueva Street" elsewhere.                                          | Fixed: "402 W. Nueva Street" (overrides).                                           |
| MED  | 5930 Bandera     | Spec says "Average", demographics page says "Median" for the same incomes; 1.436 vs 1.429 ac.         | Open for the broker; in the review notes.                                           |
| MED  | Kingsville       | "U.S. 69 (Hwy 77)" in the title; zoning AG vs C2 on the 2017 survey.                                  | Open for the broker; in the review notes.                                           |
| MED  | Seguin           | Stray black dashes on the aerial and cover.                                                           | Fixed: a no-data scan line in the USGS imagery itself, patched by build/postfix.py. |
| LOW  | Cascade Caverns  | Pin label "OLD SA RD".                                                                                | Fixed: "Cascade Caverns at Old San Antonio Rd".                                     |
| LOW  | 402 W. Nueva     | The spec calls the 175,759 count "IH 10"; the exhibit labels it "IH 35" (concurrent route).           | Open, cosmetic.                                                                     |
| LOW  | 5001 Walzem      | "Site Plan" appears twice (baked into the scan).                                                      | Open, cosmetic.                                                                     |
| LOW  | Kingsville       | The 2017 Bill Miller concept plan is from a prior buyer.                                              | In the review notes.                                                                |
| LOW  | Seguin           | The spec source line says "2010 Census", the demographics page 2020.                                  | Open for the broker.                                                                |
| LOW  | Perrin Beitel    | The flood caption does not mention the seller's LOMR.                                                 | Open: the spec page carries it.                                                     |
