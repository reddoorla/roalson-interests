# Stage A — inventory and the measuring stick

**Status: APPROVED 2026-09-17** (operator: Tucker). The measurements are facts;
the four design-judgment calls below were the operator's, and they are final —
`/figma-slices` is explicit that a call the operator does not answer stays
unanswered forever, so these are recorded here rather than in a chat log.

### The four approved calls

1. **LEARN MORE opens a property detail page.** `/properties/<uid>` per
   listing, which is also what Erik's "as short as possible for sharing" asks
   for. Consequences: a `property` custom type, a detail route with its own
   `entries()`, `linkResolver` extended (4 tests), per-listing JSON-LD and
   sitemap entries, and the package PDF becomes a download _on_ that page
   rather than the destination. **This supersedes the open question the brief
   and the memory both record as gating Stage A.**
2. **Area Normal is template bleed, not design intent** — replace it with the
   file's real text styles. The same reasoning applies to Helvetica Neue LT
   Std, which has identical provenance (both pasted from the page-2 wireframe
   kit, both bound to no style). Neither is licensed and neither will be
   loaded. The eyebrows take H5, which matches them in size and is
   cap-trimmed the same way.
3. **Filter state lives in the URL** — shareable, bookmarkable filtered views,
   which the `/portfolio` prior art deliberately does not do. Mechanism:
   `replaceState` with `searchParams`, read **on mount** rather than in `load`,
   because a prerendered route's `load` cannot see them. The unfiltered list
   stays the no-JS fallback.
4. **The nav overlay is designed from the system**, since no open-menu state
   exists anywhere in the file at any width. Full-screen garnet overlay using
   the `trapFocus` action and motion-aware transitions the repo already ships,
   with type from the ramp below.

### Three more calls, made at the start of Stage B (2026-09-18)

The `property` model forced three questions Stage A had not asked. Answered by
the operator before the type was written:

5. **A sold listing keeps its page.** `/properties/<uid>` stays up with a Sold
   state, so links brokers already emailed keep working; it is `noindex` and
   out of the sitemap, and the Sold card stays unlinked, as the comp draws it
   (Sold cards are the only cards in the file with no LEARN MORE).
6. **`category` has three values** — `Improved`,
   `Land — SA Metro & Surrounding`, `Land — Out of San Antonio` — keeping the
   content outline's split in the data. The comp's single Land section holds both land values.
   Sold is a `status`, never a category.
7. **The property page is designed from the system**, like the nav overlay: no
   frame for it exists at any width. It is the property card's anatomy at page
   scale.

### Six more calls, made before the homepage batches (2026-09-20/21)

Answered by the operator in the session, and written here the same day because
a chat log does not survive one:

8. **The homepage bar hides the wordmark until the hero's RI cutout has
   scrolled away — on the homepage ONLY** (#18: "yes, but only on the
   homepage"). Every other page keeps the bar as built in #20. The menu
   "looks good".
9. **Prismic: connect, deliver models, seed.** The repo points at the real
   `roalson-interests` repository; models reach it through the fleet's
   `prismic-models` workflow on merge to `main`, never Slice Machine's Push;
   the 22 listings are seeded through the Migration API from the client's
   public My Maps KML (enriched from the client's own `prop.htm` table, which
   joins to it 22/22 — see the journal).
10. **Maps are deferred.** #13 stays open until a Google Maps key exists; the
    map areas stay reserved, on `/properties` and in the homepage's featured
    band.
11. **Hero media: the brand's dark ground, with CMS fields.** The hero ships
    with the RI cutout over a flat ground and Prismic fields for a poster image
    and a Vimeo id. The licensed 720p clip is not reachable from the build
    machine.
12. **A partners block, not profile pages.** Name, role and CONTACT from the
    CMS; PROFILE renders only when a bio exists and opens an on-page
    disclosure. No `/team/<uid>`.
13. **Publishing: the home page and the seeded listings.** Asked once it was
    clear that a connected repo fails its build unless a `home` document is
    published, the operator chose to have both published, so the deploy shows
    the whole site. The site is pre-launch and not on its production domain;
    KML/table data the operator will want to correct is listed in the PR that
    seeds it.

Still unanswered, and defaulted: the Properties section order (the comp's —
Land first) and the reserved empty map column.

Settled without asking, because an earlier decision already answered them:
the package PDF is a Prismic **media link** (the June architecture call made
Prismic the client-maintained source of truth, so a PDF in `static/` would need
a deploy per listing); and **no `area` facet** is modelled, because the comp has
no chip row to feed — the three stacked sections _are_ the filter. Still open
and deliberately not modelled: `listing_brokers` (brief Q8).

Source: Figma `U5KIPY7HmZOQwqJXGGsEIl`, snapshot `lastModified 2026-09-17T17:20:53Z`
— **the file was still being edited the same day this was measured**, so treat
every number as a snapshot and re-pull before relying on it.

---

## 0. Three things that are not what we were told

**The file has 8 pages, not 2.** `get_metadata` with no nodeId lists two
(`Designs` 4840:60, `01 Layouts` 0:1). The document's own page collection
reports eight. Two of the six invisible pages carried material findings — a
superseded mobile Properties concept, and a "Site Plan" belonging to a different
client. Anything built off the `get_metadata` page list is built off a quarter
of the file.

**The file contains zero Figma variables.** `getLocalVariableCollectionsAsync()`
returns 0 collections and `getLocalVariablesAsync()` returns 0 variables.
`get_variable_defs` reports _paint styles_, whose names are their own hex
strings (`"#652323": "#652323"`). There is no token layer to inherit, so every
semantic name in `app.css` is ours to invent — and the rule "read tokens from
`get_variable_defs`, never from a derived artifact" is satisfied here only
trivially. Two of the three font families are invisible to that tool entirely,
because they are bound to no style.

**Two Properties section layers are named for each other.** The frame named
`Improved` (6913:2127) has a divider reading **Land**; the frame named `Land`
(6913:2128) has a divider reading **Improved Projects**; a third frame named
`Land` (6991:1124) is **Sold**. Read the dividers, never the layer names.

---

## 1. The breakpoint matrix

Three widths, two page archetypes, six deliverable frames — all on `Designs`:

|            | 1440                    | 1280                    | 390                     |
| ---------- | ----------------------- | ----------------------- | ----------------------- |
| Homepage   | `6802:1416` (h 3701.65) | `6993:443` (h 3701.65)  | `6994:796` (h 4289.43)  |
| Properties | `6903:1030` (h 5311.13) | `6992:1323` (h 5338.65) | `6992:2468` (h 3643.99) |

**There is no tablet breakpoint.** Everything from ~400px to ~1279px is
undesigned, and on Properties that gap is a genuine composition change — a
550px map beside a card column at 1280, versus a 512px map and a full-width
side-by-side at 1440 — not a reflow.

**1280 may not be a designed breakpoint at all.** Homepage 1440 and 1280 have
byte-identical heights (3701.652099609375) and identical section heights, while
their last band differs in _fill_ (gradient at 1440, flat `#e8e1d1` at 1280) and
in order. That reads as an un-reflowed copy. Confirm before treating it as a
third target.

---

## 2. Band census — the slice boundaries

Depth-1 frames with measured `y`, height and fill.

### Homepage 1440 (`6802:1416`)

| #   | Frame                         | y    | h      | Ground                       |
| --- | ----------------------------- | ---- | ------ | ---------------------------- |
| 1   | `navbar` ×2 (duplicate layer) | 0    | 80     | transparent, **sticky**      |
| 2   | `Frame 202` wrapper           | 0    | 1006   | `#3d0707`                    |
| 2a  | └ `Masthead #1` hero          | 0    | 528    | photo, **sticky**            |
| 2b  | └ `Frame 194` RI cutout       | 77   | 451    | garnet knockout              |
| 2c  | └ `Value Prop #1` specialty   | 528  | 483    | gradient                     |
| 3   | `Properties` map + slideshow  | 1006 | 827    | `#3d0707`                    |
| 4   | `Value Prop #1` Our Legacy    | 1833 | 556    | `#f2efe9`                    |
| 5   | `Frame 205` photo band        | 2389 | 800    | photo, **sticky**            |
| 6   | `Value Prop #1` footer        | 3189 | 512.65 | gradient `#F1EEE9`→`#E8E1D1` |

`Frame 202`'s children end at y=1011 but the frame is 1006 tall — the garnet
band overruns its wrapper by 5px. Do not treat 1006 as a slice height.

### Properties 1440 (`6903:1030`)

| #   | Frame (real name, read from its divider)  | y       | h               |
| --- | ----------------------------------------- | ------- | --------------- |
| 1   | `navbar garnet`                           | 0       | 80 (**sticky**) |
| 2   | `Masthead #1` — "Our Properties"          | 0       | 400             |
| 3   | **Land** (layer says `Improved`)          | 400     | 1533            |
| 4   | **Improved Projects** (layer says `Land`) | 1933    | 1673.48         |
| 5   | **Sold** (layer says `Land`)              | 3606.48 | 1192            |
| 6   | footer                                    | 4798.48 | 512.65          |

The footer band is byte-identical to the Homepage's. One shared slice.

> **Corrected 2026-09-21 (footer batch): neither half held.** An id-free diff of
> the two 163-node subtrees differs in exactly one line — the band's own fill.
> The Homepage's at 1440 is the gradient in the table above (whose `#F1EEE9` is
> a truncation: the raw stop is rgb(241.73, 239.02, 233.15) = `#f2efe9`, the
> page ground); Properties' is flat `#e8e1d1`, and at 1280 and 390 BOTH pages
> are flat — the gradient exists on 1 of 6 frames. And it is not a slice:
> `/properties`, `/contact` and the error page are filesystem routes no slice
> zone reaches, so it is layout chrome (`Footer.svelte`), with the
> homepage-only ground as a page-data flag (`footerGround`).

**Sold is real and fully designed** — this answers an open question from the
brief. It breaks the pattern of the other two categories: its map is hidden and
its listing is a 3×2 grid of six 412×448 cards spanning the full content width,
with no featured/garnet card.

---

## 3. The type system — 13 measured tuples, and the trim trap

`leadingTrim` was read per node. It is `CAP_HEIGHT` on H1, H2, H3, H4, H5, H7 and
on every Area Normal eyebrow; it is `NONE` on H6, Body 1 and Body 2.

**Atkinson cap ratio is 0.66em**, and it reproduces every measured box after
Figma's whole-pixel rounding:

| Style  | Size/LH   | Weight  | Trim     | Reported box          |
| ------ | --------- | ------- | -------- | --------------------- |
| H1     | 66/80     | 500     | CAP      | 44.0 (0.667em)        |
| H2     | 38/48     | 500     | CAP      | 25.0 (0.658em)        |
| H3     | 24/34.8   | 500     | CAP      | 16.0 (0.667em)        |
| H4     | 14/25.2   | 600     | CAP      | 9.0 (0.643em)         |
| H5     | 12/14.4   | 600     | CAP      | 8.0 (0.667em)         |
| **H6** | **12/18** | **600** | **NONE** | **18.0 — exactly LH** |
| Body 1 | 16/24     | 400     | NONE     | 24.0 — exactly LH     |
| Body 2 | 14/20     | 400     | NONE     | 20.0 — exactly LH     |

Multi-line, verified with zero residual:

```
trimmedHeight = (lines − 1) × lineHeight + round(0.66 × fontSize)
```

H1 66/80 over 2 lines → 80 + 44 = **124.0** (node 4841:560 measures 124.0).
Over 3 lines → 160 + 44 = **204.0** (node 6802:1428 measures 204.0).

**The trap:** H6 is the file's most-used style — 185 nodes, every nav link and
every "Learn more" — and it is the _only_ label-sized style with trim `NONE`. A
gap read off the comp between an H6 link and an adjacent H5 or H4 label compares
an 18px full line box against an 8–9px cap-to-baseline box. At 12px those differ
by 10px of reported height at the same nominal size.

Every gap adjacent to a CAP_HEIGHT node needs `(lineHeight − 0.66 × fontSize)`
added back, split above and below, before it becomes a CSS margin: **3.2px per
side at 12px H5, 8.1px at 14px H4, 9.4px at 24px H3, 18px at 66px H1.**

> **Corrected 2026-09-17.** This line first read "2.2px per side at 12px H5".
> It is 3.2px: `(14.4 − 8) / 2`. The other three were right. The wrong value
> would have sat every eyebrow on the site 1px low, and nothing would have
> caught it — which is why `src/lib/type-ramp.test.ts` now recomputes the trim
> from the cap ratio instead of trusting a transcribed number.

These belong in `app.css` as `t-*` utilities, authored once before the first
slice — not re-derived per slice.

---

## 4. Fonts — one licensed, two not, and the comp is lying about one

| Family                     | Nodes         | Status                                                    |
| -------------------------- | ------------- | --------------------------------------------------------- |
| Atkinson Hyperlegible Next | 231 runs      | **OFL, licensed.** The only legitimate face.              |
| Area Normal (style Bold)   | 82 on Designs | **Unlicensed** (Blaze Type). Bound to no style.           |
| Helvetica Neue LT Std      | 10            | **Unlicensed**, and undocumented until now.               |
| Inter                      | 3             | Canvas annotations ("Desktop"/"Laptop"/"Mobile"). Ignore. |

**Area Normal is MISSING from Figma.** `hasMissingFont = true` on all 82 nodes
and no Area family is installed, so the comp is rendering a _substitute_ — its
widths and its measured 0.818 trim ratio are the substitute's metrics, not Area
Normal's. The comp misrepresents these eyebrows twice over. (The family is
`Area Normal`, style `Bold`; there is no family called "Area Normal Bold".)

**Helvetica Neue LT Std is comp drift, not intent.** All 10 nodes are the footer
address block, pasted from the wireframe kit on page 2 (which uses that family
1512 times) and never restyled. It matches Body 2 exactly in size and
line-height — 14/20 400. Replace with Body 2; do not load it.

**Atkinson's weight range is free.** The css2 responses for `wght@400..600` and
`wght@200..800` point at the **identical** woff2 file. Narrowing the range does
not shrink the download — it only narrows the declared `font-weight` on the
`@font-face`, so any 300 or 700 introduced later is silently synthesised.
`app.html` currently requests `400..600`; widening to `200..800` costs zero
bytes and removes a silent-failure mode.

---

## 5. Colour — corrections to the brief, and one new failure

The repo's split (`--color-secondary` `#646059` for text, `--color-dust`
`#B2AC9F` for fill) is **re-verified correct**: 5.45 / 6.25 / 4.80 on
off-white / white / sand, and correctly failing on garnet (1.85), where dust
itself is the right choice at 5.11.

Failures that are real:

| Pair              | Ratio    | Where                                                                                                 |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| dust on off-white | **1.97** | 6 nodes — the navbar CONTACT US label on light-ground pages                                           |
| dust on white     | **2.26** | 4 nodes — the nav-link component spec on the Components sheet                                         |
| white on sand     | **1.30** | 2 nodes in Concepts — a hero H2 + eyebrow. **Not in the brief.**                                      |
| dust on sand      | 1.73     | No text, but dust rules and the slideshow progress bar are graphics at <3:1 if reused on a light band |

**Two brief claims are wrong and should not be carried forward:**

- _The mobile hamburger is not a contrast failure._ `np_menu_1814288` sits
  inside `navbar garnet-mobile`, i.e. on a **garnet** ground: 5.11:1, passing.
  > **Corrected 2026-09-20 (nav batch): this correction was itself wrong, and
  > the brief was right.** `navbar garnet-mobile` (`6997:2189`) has **no fill**
  > — "garnet" names the wordmark's colour (`RI Wordmark Garnet_Dust`), not a
  > ground. The bar is pinned and transparent, so the dust hamburger sits on
  > whatever is under it: the masthead photo at the top, the off-white page
  > once scrolled — 1.97:1, under the 3:1 a control's glyph needs. The build
  > draws it dust only while the bar floats over a dark band, and garnet on its
  > off-white ground. See the journal entry of that date.
- _The dust value-list items pass._ The 31 dust eyebrows sit on the
  `#652323`→`#3D0707` gradient — 5.11:1 at the garnet end, 7.55:1 at the dark
  end.

The one that is real is the **CONTACT US label on the light-ground navbar**, and
the nav-link _component spec_ carries the same defect one step earlier — so a
nav built from the Components sheet rather than from the page ships it.

---

## 6. Sticky is a whole-page mechanism — four of them

`scrollBehavior: STICKY_SCROLLS`, read from the REST API. This is the class the
skill says costs nine PRs when discovered after the slices merge.

1. **navbar** — y=0, h=80 desktop/laptop, h=70 mobile. Per-page treatment:
   transparent over the homepage hero, solid garnet on Properties.
   > **Corrected 2026-09-20 (nav batch):** the Properties bar is not solid
   > garnet. Read from the REST API, `navbar garnet` (`6909:1859`), its mobile
   > sibling and both variants of the homepage's `navbar` set carry **no fill
   > at any width**; "garnet" is the wordmark. As drawn, the pinned bar stays
   > transparent over everything that scrolls under it, which the build does
   > not reproduce — see `Nav.svelte`'s header comment.
2. **`Masthead #1`** — the homepage hero pins at y=0, h=528 at _all three_
   widths, and the next band slides over it.
3. **`Frame 205`** — the photo band pins: y=2389 h=800 desktop, collapsing to
   y=3072.8 h=240 on mobile.
4. **`divider`** on Properties — h=136, two on desktop (y=1933, y=3606.5), one
   at 1280, none on mobile. The category headings pin.

---

## 7. Inferred interactions — none of this is in the prototype

Prototype wiring was pulled from the REST API. Homepage `6802:1416` has 361
nodes of which **10** carry interactions; Properties `6903:1030` has 575 of
which **5**. The complete inventory is: `ON_HOVER` variant swaps on
`button light`, the carousel's `AFTER_TIMEOUT` autoplay and its arrow
`ON_CLICK`s, the navbar's 2s `AFTER_TIMEOUT`, and the `resources` disclosure
plus `resources pop up` (an `OVERLAY` with `destinationId: null` — wired to
nothing).

**Not one interaction exists on any LEARN MORE button, map pin, PROFILE →,
CONTACT → or nav link.** That is a measured negative, not an absence of looking.

Everything below is therefore inferred from variants and geometry:

- **Sticky nav reveals the wordmark.** `navbar` (6850:1503) is a 2-variant set
  differing _only_ by logo presence. The homepage instance sits on the
  logo-less variant, which is what a nav that reveals the wordmark once the
  451px RI cutout scrolls away would look like. Strongest signal in the file.
- **The whole primary navigation is behind a hamburger at every width,
  including 1440** — and **no open-menu state exists anywhere in the file.**
  That is a design gap, not an implementation question.
- **Homepage featured carousel** — `properties slideshow` is a six-variant set
  with paired arrows.
- **Mobile Properties is a carousel, not a list** — `feature scroll` and
  `regular scroll` are four-variant 350×540 sets appearing only at 390.
- **Tap-to-expand map on mobile** — `np_expand_2178917` sits at the corner of
  each mobile map; desktop maps have no such icon.
- **A resources disclosure and a pop-up** exist, are wired, and are `visible:
false` on every approved frame.
- **Possible parallax** on `Frame 205`: a 1440×960 image in an 800px band with
  160px of overhang and no crop reason. Weak — art direction produces the same
  geometry.

---

## 8. A ground gradient that crosses section boundaries

Measured, not inferred, and it constrains slicing. On Properties 1440 the left
gutter is flat `#F2EFE9` from y=405 to y=2106, grades to `#E8E1D1` by y=2343,
and stays. **That transition falls in the middle of the Improved Projects
section**, aligning with an inner container rather than any section edge.

So the "warm down the page" treatment is owned by no single section. A slice
cannot own half of it. This needs a deliberate decision — page-level background
layer, or per-slice grounds that approximate it — before the inventory is fixed.

---

## 9. What the repo already ships, and what it does not

Read from `docs/COMPONENTS.md` (49 modules) and the route code.

**Does not exist and must be built:** a filterable listing (no listing route, no
facet UI, no sort, no search; `fuse.js` is not a dependency), a `property`
custom type and its detail route, a map (no component, no CSP host — the CSP
baseline allows Prismic/Vimeo/Turnstile/Google Fonts only), any prerender story
for filter state, and an image lightbox.

**Slices cannot currently receive anything but their own data.**
`[uid]/+page.svelte` is `<SliceZone slices={...} {components} />` with no
`context` prop; the string `context` appears nowhere in `src/lib/slices` or
`src/routes`; `page-load.ts` returns exactly `{ page, ...pageMeta(page) }`.
Three options, two of them proven next door in reddoor-website:

1. **`fetchLinks` on a content relationship** — cheapest way to give the
   slideshow its images.
2. **A dedicated route that queries the collection** — what Properties maps
   onto (reddoor-website's `/portfolio` does exactly this).
3. Thread `SliceZone`'s `context` — changes `loadPage`'s return shape and its 4
   tests. A deliberate one-time change, not a per-slice one.

**Routing:** the client is deliberately **routes-free** — Prismic answers 400 to
_every_ query when a `routes` entry names a type with no published document.
`linkResolver` is the local replacement and knows exactly one shape today.
Adding a `property` type means **extending `linkResolver`** (4 tests), adding a
route folder with its own `entries()`, and adding the route to the sitemap's
`STATIC_ROUTES` by hand — a filesystem route the CMS cannot see is otherwise
simply missing.

---

## 10. The filter, and what is actually liftable

reddoor-website's `/portfolio` is the prior art: 1,282 lines in one route file,
43 documents, 6 boolean facets + Fuse search + 4 sorts, entirely client-side,
under the same `prerender = "auto"`.

**Liftable as pure logic:** `measureCards` / `playFlip` / `durationForTravel`
(window + WAAPI only, keyed on a data attribute, zero local imports); the
pending/applied + debounce + busy-lock committer; the keep-mounted
visible/hidden ordering that makes it degrade honestly without JS; the lazy-Fuse
loader; and the entire a11y wiring — `aria-live` result count, `aria-pressed`
filters, a real `role="listbox"` sort with outside-pointerdown and Escape
handling. **11 Playwright specs come with it** and are the fastest way to prove
a port works.

Measured constants: FLIP velocity 0.5 px/ms, duration clamped 900–1550ms, ease
`cubic-bezier(0.16, 1, 0.3, 1)`, commit debounce 250ms shared by filters, sort
and keystrokes; Fuse threshold 0.2, `ignoreLocation`, min query 2.

**Correction to that file's own comments:** two of them claim the commit runs
"inside one serialized View Transition". It does not — `grep startViewTransition`
returns nothing. It is measure → invert → WAAPI with a busy-lock. Lift the code,
not the comment.

**Not liftable:** none of it is a component. The six-way predicate, the filter
list and the Fuse keys all name `project`'s fields literally and must become a
config array. Its Tailwind classes use tokens Roalson does not have.

**And the decision it forces:** `/portfolio` never touches the URL. No `goto`,
no `searchParams`, no history. Filter state is unshareable and the back button
does nothing. That is _why_ it coexists with `prerender = "auto"` — and it is
the first thing to decide for Roalson, because "send me the link to those three
properties" is a normal ask on a real-estate site and this shape cannot answer
it.

---

## 11. Content reality

- **22 active listings**, moving weekly. The outline splits them 5 Improved / 18
  Land; Erik's own figure is ~10/90. Reconcile — it changes what the filter is
  for.
- **Geocoding is solved and free:** the public My Maps KML returns 22 placemarks
  with coordinates and package-PDF links. Its 8 folders are working buckets, not
  a taxonomy — at least three listings are filed under the wrong area. Import
  the pins, have a human assign the areas.
- **~40 archive-only properties** are still downloadable from the live host, and
  the approved design ships a Sold section, so this may not be deferrable.
- **Package PDFs total 130.2 MiB across 22 files** — mean 6.2 MB, largest 14.4
  MB. A 14 MB click-through from a card is a real mobile-data cost. There are no
  legacy HTML detail pages at all; the PDF _is_ the detail on the old site.
- **Copy is written and stable since July**, and unapproved in writing. Both
  partner bios are deliberately empty in the 2026-09-01 email, which has had
  **zero replies in 16 days**.
- **Photography is the thinnest part of the build:** exactly **three** real
  client property photos exist for 22 listings. Both headshots are placeholders.
  The licensed hero clip is 720p against a 1440-wide full-bleed band.
- Every card in every comp is the **same placeholder** — same photo, same
  "UP TO 16,700SF", same two bullets. Do not infer card content or section
  order from the comps.
