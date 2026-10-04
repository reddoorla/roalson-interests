<script lang="ts">
  // The Properties page body: the comp's stacked sections (6903:1030 at 1440,
  // 6992:2468 at 390), each a divider — a 2px garnet rule over an H3 label —
  // and its listing. Active sections put the listing in the comp's right
  // column (847 of 1280) with ONE card featured — the comp's first, ours the
  // one on the centre line, see below — and the rest in the light
  // token their ground does not use; Past Projects (the comp's Sold section)
  // is a 3×2 grid of unlinked off-white cards across the full width
  // (6991:1145).
  //
  // THE VIEW TABS (P5, 2026-09-25: "land / improved projects / all") are links
  // to a fragment, and app.css filters by `:target` — so they work with no
  // script, on first paint of a shared `/properties#land`, and with Back. The
  // targets are empty `hidden` spans, so following one scrolls nothing. Once
  // hydrated, `data-view` holds the view and the CSS reads that instead, so a
  // fragment that is not a view (the skip link's) leaves it alone. A hidden
  // section stays in the DOM: its map keeps its state and its cards are just
  // off the centre line. Past Projects has no view and shows under every tab.
  //
  // Two of the comp's mechanisms belong to this component and are page-level:
  //
  // - The dividers PIN. From the second section on, the divider is sticky with
  //   the comp's 100px top pad, which lands its rule 20px under the 80px nav;
  //   the first divider (6909:1956, 40px pad) does not pin, and none pin on
  //   mobile — exactly what the prototype's STICKY_SCROLLS flags say.
  //   Except Improved Projects under its own view (MarkUp, 2026-10-01): it is
  //   then the page's first section, and app.css dresses it as Land — no
  //   ground, 40px strip, a divider that does not pin, sand cards.
  // - The ground warms down the page. Stage A measured the gutter flat
  //   off-white to y≈2106, grading to sand by y≈2343 — inside the second
  //   section, not at any edge. A pinned divider with a flat ground would seam
  //   against that, so the transition is approximated at the second section's
  //   top: its 100px pad carries the off-white→sand gradient, and everything
  //   below is sand. That moves the fade ~170px up from the comp; it keeps the
  //   first section's flat cards flat (off-white on off-white, as drawn) and
  //   every later card reading as a panel on sand.
  //
  // THE MAP IS IN (#13). It is ONE component per active section at both
  // widths, not two: the comp draws a 397 x 595 panel in column 1 at 1440 and
  // a 350 x 200 box above the cards at 390, and those are the same map in a
  // different box. The box is what PropertyMap measures to decide its frame
  // (pin size, padding, opening picture), so the switch is CSS here and
  // nothing in this file consults a breakpoint twice. (Since 2026-09-28 every
  // map draws expand and +/− at every width; the box no longer decides that.)
  //
  // TOP-ALIGNED, NEVER STRETCHED. The comp holds the panel at 595 beside a
  // 5-card list 1457.48 tall, so a fixed `lg:h-(--map-height)` (595, see
  // 4 below for why it is a variable) and no `h-full`/`self-stretch` — the
  // grid's default `stretch` would grow the map to the list's height.
  //
  // THE MAP PINS TOO, AND ITS CAMERA FOLLOWS THE CARDS (#112, the operator's
  // ask: "the idea is the map is sticky and as different properties highlight
  // we scroll around to them"). Three decisions, all of them here rather than
  // in PropertyMap, because they are page-level the way the dividers are:
  //
  // 1. IT STICKS UNDER THE PINNED DIVIDER, NOT BEHIND IT. Measured on a
  //    production build at 1440x900: the pinned divider renders 145.41 tall
  //    (its 100px pad plus a 45.41 label block) and the unpinned first one
  //    85.41. So the offset is READ off the divider, not typed: a font swap or
  //    a label that wraps moves it, and a typed 100 would have been wrong by
  //    45.41 from the day it was written. The first section has no pinned
  //    divider at all, so its map lands on `scroll-padding-top` instead — the
  //    one place this stylesheet already says where the usable top is (app.css:
  //    the bar plus 20px of air, 100px at `lg`).
  //
  // 2. IT RELEASES BY ITSELF. A sticky grid item is confined to its GRID AREA,
  //    so the map stops travelling when the card column ends and no script has
  //    to notice. Measured rather than assumed, on the fixture at 1440x900:
  //    grid top 476.02, GRID PADDING-TOP 40, border-box 1092.39 — so a CONTENT
  //    box of 1052.39, and against a 595 map that is 457.39px of travel,
  //    stuck from scrollY 416.02 to 873.41. At scrollY 900 the map's top reads
  //    73.41 (= 100 - 26.59 of overshoot). Exactly the predicted release.
  //
  //    THE GRID AREA IS THE CONTENT BOX, and an earlier version of this note
  //    subtracted the map from the BORDER box instead — which includes the
  //    `lg:pt-10` the area does not. It read "497.39px of travel, stuck from
  //    376.02", both 40 out, and the claim that the map is stuck anywhere in
  //    376..416 was simply false: measured at 1440x900, the map's top is
  //    140.02 at scrollY 376 and first reaches its 100px offset at 416. The
  //    RELEASE point survived the error only because the two 40s cancel at
  //    that end (416.02 + 457.39 = 376.02 + 497.39), which is exactly why it
  //    went unnoticed — the one number anyone checked was the one the mistake
  //    could not move.
  //
  //    On the real portfolio the land section gives 4499.86px of travel and
  //    the improved section 873.63. Those two were RE-MEASURED rather than
  //    assumed to carry the same error, and they do not: both are already the
  //    content-box figures (the border boxes are 4539.86 and 1013.63).
  //
  // 3. ONLY FROM `lg`. At 390 the map is a 200px box ABOVE the cards; pinning
  //    it would spend 200 of a 844px viewport permanently and the comp does not
  //    draw it. `centreWatch` is told the same breakpoint and does not run
  //    below it — not "runs and is ignored", which would be an observer per
  //    section on every phone.
  //
  // 4. IT PINS IN THE MIDDLE OF THE WINDOW, AND 1 IS ITS FLOOR (operator,
  //    2026-09-23: "on properties, stick the map in the center of the screen
  //    rather than floating to the top"). The offset is
  //    `max(var(--sticky-top), 50vh - half the map)`.
  //
  //    The WINDOW's middle, not the middle of the space under the divider,
  //    because that is the line everything else here keys to: the card the
  //    camera follows and the garnet card are both the card crossing the
  //    window's middle (`centreWatch`). A window-centred map puts its own
  //    centre on that line, level with the card it is showing. Measured on a
  //    production build at 1440x900: box 152.5–747.5, centre 450 of 900, where
  //    it used to be 100–695 in section 0 and 145.41–740.41 under a pinned
  //    divider.
  //
  //    THE `max` IS THE CLAMP, and the reason 1 still matters. On a window
  //    shorter than the map plus twice the floor, half the window less half the
  //    map is above the floor — 62.5 at 1440x720, which is under the bar in
  //    section 0 and 83px under the pinned divider in every later section — so
  //    the map holds at `--sticky-top` instead, exactly where it pinned before.
  //    The two meet at a window 795 tall in section 0 and 885.81 under a pinned
  //    divider; below those it is the old pin, above them it is centred.
  //
  //    The half is DERIVED from the one `--map-height`, not typed as 297.5, so
  //    the comp's 595 is one edit and not two.
  //
  //    The offset moves both ends of the travel and not its length: a larger
  //    `top` pins EARLIER in the scroll and lets go earlier, by the same
  //    amount. 2's fixture numbers were measured at the old 100, before the
  //    view tabs. On the real portfolio at 1440x900 (production build) the
  //    land map then pinned at scrollY 363.52 and let go at 4863.38 (416.02
  //    and 4915.88 at the old offset), and the improved map at 5634.39 and
  //    6508.02 (was 5641.48 and 6515.11).
  //
  //    RE-MEASURED WITH THE VIEW TABS IN (2026-09-28, 1440x900). Their row
  //    moves everything under it down 80px (40 of padding, a 40px row). On the
  //    real portfolio (production build) the land map pins at scrollY 443.52
  //    and lets go at 4963.38, the improved map at 5734.39 and 6608.02; on the
  //    fixture (dev server: /dev/* 404s on a build) the grid top is 556.02 and
  //    the map is stuck from 443.52 to 900.91. The offsets did not move, and
  //    neither did the fixture's or the improved section's travel (457.39,
  //    873.63). The land section's is 4519.86, 20px more than 2 says: its card
  //    column is 20px taller than it was, and the tab row is not inside it.
  //
  // WHICH LISTING IS ACTIVE HAS ONE ANSWER: the card crossing the middle of
  // the screen. Pressing a pin does NOT set it — the press scrolls that card
  // to the centre and the same rule then reports it. See centreWatch.ts.
  //
  // AND THE GARNET CARD IS THAT ANSWER DRAWN (operator, 2026-09-23: "please
  // change the highlighted box as we scroll"). The comp features the FIRST
  // listing of each active section. Once the map's camera followed the centre
  // line, a highlight nailed to card 0 disagreed with the map. So the same
  // `activeIds[section.id]` the map is handed picks the featured card. A press
  // and focus do not set it. A hover does (Erik, 2026-10-02): a mouse resting
  // on a card for HOVER_DWELL_MS writes the same `activeIds`, see
  // hoverActivate.ts — the same state, not a second one.
  //
  // `featured` is colour only (PropertyCard's TONES), so the highlight moves
  // without moving the column; active-card-highlight.spec.ts measures every
  // card's box either side of a move. The fade is app.css's, keyed to
  // `data-centre-id`, so it adds nothing to the server's markup.
  //
  // WHAT DOES NOT MOVE. With no script, and in every frame before hydration,
  // `activeIds` is empty and the fallback is the first listing, the `j === 0`
  // this replaced. Below `lg` `centreWatch` does not run (3 above), so a phone
  // keeps card 0 featured too. There the map is a 200px box above the cards
  // and does not stick, so a travelling highlight would match nothing on
  // screen. Past Projects has no map and no watcher. (Since #14 a phone WITH
  // script shows the sections as carousels in the comp's own tones, where
  // only the first section's first card is garnet; see below.)
  //
  // AND NOTHING HERE HOLDS THAT RULE BACK WHILE A SCROLL TRAVELS. It used to —
  // see `revealCard` for the two separate defects that cost — and the job now
  // belongs to the camera, which will not launch a flight over one already in
  // the air (`cameraMove`'s `in-flight`). This component is back to reporting
  // which card is in the middle, whatever put it there.
  //
  // BELOW `lg`, WITH SCRIPT, EACH SECTION IS A CAROUSEL (#14): the 390 comp's
  // `feature scroll` / `regular scroll` sets, one 350-wide card at a time with
  // a 2px bar and two arrows INSIDE the card, between its photo and its text.
  // The stacked list stays what the server sends, what a browser without
  // script keeps, and what `lg` and up gets; the carousel is the same <ul>
  // re-laid out once hydrated below `lg`. Below `lg` the centre rule does not
  // run (3 above), so the two never both decide which card is "the" card.
  //
  // - The primitive is $lib/carousel.svelte.ts, with CarouselArrows and
  //   CarouselProgress, through ListingCarousel (one instance per section).
  //   Slider.svelte was read and declined, for #14's reason: its controls are
  //   a row outside the slides and it has no progress bar.
  // - THE CONTROLS ARE IN THE CARD, NOT IN THE SLIDE. The <ul> becomes one grid
  //   of [photo][bar][arrows][text] rows (below `md`; from `md` the photo is a
  //   column beside the other three), every slide spans all of it as a
  //   SUBGRID, and the bar and arrows are the grid's own items. So they sit
  //   between the photo and the text of whichever card is on stage and are
  //   never inside one — a slide that turns away goes inert, and an arrow in it
  //   would take the keyboard's focus with it (#34). Same shape as the homepage
  //   band's card.
  // - The comp's variants: the first section's first card garnet, every other
  //   card in the light tone the stacked list already gives it; the arrows and
  //   bar are cream on the garnet card and garnet on the light ones. No
  //   autoplay and no transition — the comp's arrows CHANGE_TO with none, and
  //   there is no AFTER_TIMEOUT on these sets — so there is no Pause to owe and
  //   nothing for reduced motion to stop.
  // - A pressed pin turns the carousel to its card, see `revealCard`.
  import { onMount } from "svelte";

  import { centreWatch } from "$lib/actions/centreWatch";
  import { hoverActivate } from "$lib/actions/hoverActivate";
  import { brandButtonBase, brandButtonPadding } from "$lib/components/BrandButton.svelte";
  import CarouselArrows from "$lib/components/CarouselArrows.svelte";
  import CarouselProgress from "$lib/components/CarouselProgress.svelte";
  import ListingCarousel from "$lib/components/ListingCarousel.svelte";
  import PropertyCard from "$lib/components/PropertyCard.svelte";
  import PropertyMap from "$lib/components/PropertyMap.svelte";
  import type { Carousel } from "$lib/carousel.svelte";
  import {
    listingViews,
    viewFromHash,
    type ListingSection,
    type ListingView,
  } from "$lib/property-listing";
  import { sectionPoints } from "$lib/property-map";

  interface Props {
    sections: ListingSection[];
    class?: string;
  }

  let { sections, class: passedClasses = "" }: Props = $props();

  // The comp's gutters: 20 at 390, 80 at 1440 (PropertyDetail's 16 predates
  // the 390 frame being read).
  const GUTTERS = "mx-auto max-w-[1440px] px-5 sm:px-8 xl:px-20";

  /** Tailwind's `lg` (64rem). The one breakpoint this file pins at. */
  const LG = 1024;

  /** Where the sections are carousels: the exact complement of Tailwind's
   *  `lg`, `(width >= 64rem)`, so script and the stylesheet agree on which
   *  layout is on screen at every width and font-size setting. Written as a
   *  range, not `max-width`, so that nothing between 1023 and 1024 is both. */
  const BELOW_LG = "(width < 64rem)";

  /** The listing grid a carousel lays its list out on — see the header. Row 4
   *  (row 3 from `md`) takes what is left, so every slide is as tall as the
   *  tallest and the arrows never move between cards. */
  const CAROUSEL_LIST =
    "grid grid-cols-1 grid-rows-[auto_auto_auto_1fr] md:grid-cols-2 md:grid-rows-[auto_auto_1fr]";

  /** Slide `j` of a carousel on that grid. `invisible`, with no transition:
   *  the comp swaps variants outright, and a card that is not on stage must
   *  paint nothing over the one that is. */
  const slideClass = (carousel: Carousel, j: number) =>
    `col-span-full row-span-full grid grid-cols-subgrid grid-rows-subgrid${
      carousel.isActive(j) ? "" : " invisible"
    }`;

  /** False on the server, before hydration and from `lg` up. */
  let narrow = $state(false);
  $effect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(BELOW_LG);
    // Below `lg` the centre rule does not run (centreWatch), so a listing it
    // reported up there is not what the carousel shows. It is forgotten on
    // the way down: held, it kept the map featuring a card the page had
    // stopped showing and dimming the marker of the one on stage (an iPad
    // turned to portrait, 1180 -> 820). Back at `lg` the rule reports again.
    const sync = () => {
      narrow = query.matches;
      if (narrow) activeIds = {};
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  });

  /** Each section's carousel, by section id, for a pin press to turn. Not
   *  state: nothing renders from it, and an instance is a bag of getters that
   *  must not be proxied. */
  const carousels: Record<string, Carousel> = {};

  /**
   * What `--sticky-top` holds until the first measurement, PER SECTION — and
   * the reason it is a CSS expression rather than a number is that it has to
   * be right with no script at all.
   *
   * Both the map and the divider are `position: sticky` in plain CSS, so they
   * pin on a page that never hydrates. This used to ship `100px` for every
   * section and be corrected only by an `$effect`, which meant that with
   * script off — and in every frame before hydration — a pinned section's map
   * pinned 45.41px BEHIND its own opaque divider. Measured on a production
   * build of /properties at 1440x900, scrollY 6000: `--sticky-top` 100px, map
   * top 100, divider bottom 145.41, and 45.41px of the fallback list of
   * listing links painted under it. That list is the whole of the map for a
   * no-JS visitor, and the part covered was its top.
   *
   * So the server now sends the right answer for the case it can know:
   * section 0's divider does not pin (its map lands on the declared usable
   * top), every later one does (its map lands on the divider) — except one
   * app.css dresses as section 0, which sets `--listing-pinned-top`. Both come from
   * app.css, which is where this site says where its usable top is.
   */
  const UNMEASURED_TOP = "var(--usable-top)";
  // `--listing-pinned-top` is app.css's override for a later section that is
  // dressed as section 0 (Improved Projects under its own view).
  const UNMEASURED_PINNED_TOP = "var(--listing-pinned-top, var(--listing-divider-top))";
  const unmeasuredTop = (i: number) => (i > 0 ? UNMEASURED_PINNED_TOP : UNMEASURED_TOP);

  let dividerEls = $state<(HTMLElement | undefined)[]>([]);
  let listEls = $state<(HTMLElement | undefined)[]>([]);
  /** Per section: the MEASURED offset in px, or undefined where nothing has
   *  been measured yet — in which case the CSS fallback above stands. */
  let stickyTops = $state<(number | undefined)[]>([]);
  /** Section id → the listing id on the centre line. */
  let activeIds = $state<Record<string, string>>({});

  const views = $derived(listingViews(sections));
  /** The view, once hydrated; undefined on the server, where `:target` rules. */
  let current = $state<ListingView | undefined>();
  onMount(() => {
    current = viewFromHash(location.hash) ?? "all";
  });
  /** A fragment that names no view leaves the view alone. */
  function onhashchange() {
    current = viewFromHash(location.hash) ?? current;
  }

  /** The scrollport's declared usable top, read rather than typed — app.css
   *  declares it as `--usable-top` and applies it as `scroll-padding-top`. */
  function usableTop(): number | undefined {
    const declared = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
    return Number.isFinite(declared) ? declared : undefined;
  }

  function measure() {
    stickyTops = sections.map((_, i) => {
      // Section 0's divider is deliberately NOT sticky (see the comp note
      // above), so its height says nothing about what is pinned over its map.
      const el = i > 0 ? dividerEls[i] : undefined;
      // A ZERO HEIGHT IS NOT A MEASUREMENT. Under jsdom every box is 0, and in
      // a browser this can be asked before first layout; either way `top: 0`
      // would pin the map against the very top of the window, under the bar.
      //
      // Section 0 has no pinned divider to read, so its answer is the declared
      // usable top. Every other section that could not be measured returns
      // `undefined` and KEEPS THE CSS FALLBACK, which for a pinned section is
      // the derived divider height — not the bar. Returning a number here was
      // the old behaviour and it is what put the naked 100 back over a
      // correctly-rendered no-JS page the moment hydration ran with a
      // divider it could not yet measure.
      const measured = el ? el.getBoundingClientRect().height : 0;
      // A later divider dressed as section 0's does not pin either (app.css:
      // Improved Projects under its own view, MarkUp 2026-10-01), so the
      // cascade decides and not `i`; below `lg` none pins.
      if (measured > 0) return getComputedStyle(el!).position === "sticky" ? measured : usableTop();
      return i > 0 ? undefined : usableTop();
    });
  }

  // Guarded the way PropertyMap guards its own: jsdom ships no ResizeObserver,
  // and a component that throws at mount takes down every test that merely
  // renders the page. With none, `measure()` still runs once — every divider
  // then reports a zero box, which is not a measurement, so every map lands on
  // `usableTop()`. Nothing pins in jsdom anyway; what matters is that the page
  // renders.
  $effect(() => {
    void sections;
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const ro = new ResizeObserver(measure);
    for (const el of dividerEls) if (el) ro.observe(el);
    measure();
    return () => ro.disconnect();
  });

  /** A pressed pin scrolls its card to the middle of the screen, where
   *  `centreWatch` then finds it and makes it active. Two steps on purpose —
   *  see centreWatch.ts for why a press may not name the active listing
   *  itself.
   *
   *  AND THAT IS ALL IT DOES TO THE PAGE. Its answer — true when the card is
   *  now travelling to the centre line — lets the map send its camera there
   *  at once instead of through the cards the glide crosses (PropertyMap's
   *  `heading`; it holds back nothing on this page).
   *
   *  This function used to also suspend the centre
   *  rule for the length of the scroll, because a smooth scroll crosses every
   *  card between here and there and the camera was handed a new destination
   *  at each one — measured at 1440x900 with motion allowed, pressing the
   *  IH-35 pin from scrollY 0 sent the page 0 -> 936 and the camera FOUR
   *  flights in 322ms. Two things were wrong with fixing it here.
   *
   *  It was the wrong PLACE. Every other smooth scroll chained exactly as the
   *  press did, because this was never about presses: measured on a
   *  production build of /properties at 1440x900, `End` from scrollY 0 issued
   *  5-9 `flyTo` inside 71-81ms, three `PageDown` issued 5, four `Space`
   *  issued 4. Fixing the one path that had been noticed is the defect-class
   *  mistake CLAUDE.md names, committed in the act of fixing a defect. The
   *  rule now lives where the camera is COMMANDED — `cameraMove`'s
   *  `in-flight` refusal, over PropertyMap's own record of the flight it last
   *  issued — and the press is not a case in it, it is just another scroll.
   *  (It was `page-scrolling`, a debounce on the document's own events, until
   *  #127 and #128 showed that a proxy for "is the page moving" is blind to a
   *  mouse wheel and unbounded under a scrollbar drag.)
   *
   *  And it was wrong CODE. `pressScrolling` was keyed per section while the
   *  three timers backing it were single component-level variables shared by
   *  every section, so a press in one section cancelled the pending resume of
   *  another and left that section's rule suspended for good: measured on a
   *  production build at 1440x900, a land press followed 300ms later by an
   *  improved press left the land map issuing ZERO camera commands across
   *  five subsequent card crossings, its centre byte-identical at -98.73018,
   *  29.77384, against 9 for the same scroll with no cross-section press. The
   *  same class as the defect it was fixing, which is the other reason none of
   *  it is here any more: the machinery is gone rather than made per-section.
   *
   *  `scrollIntoView`, not `scrollTo`: CLAUDE.md's rule is about not fighting
   *  SvelteKit's own post-navigation scroll, and `$lib/utils/instantNavScroll`
   *  — the util it names — takes `BeforeNavigate`/`AfterNavigate` objects and
   *  does nothing but flip `scroll-behavior` around a navigation. There is no
   *  navigation here. The HOW is left to CSS either way: `html` is
   *  `scroll-behavior: smooth` and app.css zeroes that under
   *  `prefers-reduced-motion: reduce`, so this line does not decide whether it
   *  glides. (Optional call: jsdom does not implement it.) */
  function revealCard(sectionIndex: number, id: string): boolean {
    const list = listEls[sectionIndex];
    if (!list) return false;
    // Below `lg` the list is a carousel (#14) and the card is probably off
    // stage — invisible and inert in the same grid cell as the one on it —
    // so scrolling "to" it would show the wrong listing. The press turns the
    // carousel to it and brings the carousel into view, `nearest` so a card
    // that already fits under the map leaves the map on screen too.
    const cards = [...list.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.dataset.centreId !== undefined,
    );
    const card = cards.find((child) => child.dataset.centreId === id);
    if (!card) return false;
    const carousel = carousels[sections[sectionIndex]?.id ?? ""];
    if (carousel?.enabled) {
      carousel.goTo(cards.indexOf(card));
      list.scrollIntoView?.({ block: "nearest" });
      return false;
    }
    card.scrollIntoView?.({ block: "center" });
    // The card is on its way to the centre line, so the map may send its
    // camera there now rather than through every card the glide crosses
    // (PropertyMap's `heading`). Only here: a carousel's press reaches no
    // centre rule.
    return true;
  }
</script>

<svelte:window {onhashchange} />

<!-- A carousel's bar and arrows (#14): rows 2 and 3 of CAROUSEL_LIST, and the
     top of column 2 from `md`. They are the grid's OWN items, never inside a
     slide, and `z-[2]` so they paint over the card they sit in. `role="none"`
     like the <ul> they are in, which stops being a list in carousel mode.
     Their tone is the card on stage's: cream on garnet, garnet on the light
     cards. The focus ring takes its colour from the ground above the element,
     and above these is the SECTION, not the card — so on the garnet card the
     ring is set here, off-white as `.bg-primary > *` would have made it. The
     comp's 20 above the bar, 10 under it, 20 under the arrows (the text
     panel's own top pad). The column is explicit, like the row: a row-only
     item is AUTO-placed, and with every cell already taken by the slides
     auto-placement opens a new column for it — measured, a 205px card with
     the arrows in a second column at 390. -->
{#snippet controls(carousel: Carousel, onGarnet: boolean)}
  {@const tone = onGarnet ? "cream" : "garnet"}
  <li
    role="none"
    class="relative z-[2] col-start-1 row-start-2 mx-5 mt-5 h-0.5 md:col-start-2 md:row-start-1"
  >
    <CarouselProgress {carousel} {tone} />
  </li>
  <li
    role="none"
    class="relative z-[2] col-start-1 row-start-3 mx-5 mt-[10px] flex justify-end md:col-start-2 md:row-start-2
      {onGarnet ? '[--focus-ring:var(--color-background)]' : ''}"
  >
    <CarouselArrows {carousel} {tone} />
  </li>
{/snippet}

<div class={passedClasses} data-listing data-view={current}>
  {#if sections.length === 0}
    <p class="t-body-1 {GUTTERS} py-20 text-primary">
      No properties are listed at the moment. Please check back soon.
    </p>
  {/if}

  {#if views.length}
    <!-- Colours are app.css's, keyed to `:target` and `data-view`. aria-current
         only once hydrated: without script the server cannot know the view,
         and app.css puts a hidden "(selected)" in the tab's name instead. -->
    <div role="group" aria-label="Show listings" class="{GUTTERS} flex flex-wrap gap-2.5 pt-10">
      {#each views as view (view.id)}
        <a
          href="#{view.id}"
          data-view-tab={view.id}
          aria-current={current === view.id ? "true" : undefined}
          class="{brandButtonBase} {brandButtonPadding(false)}">{view.label}</a
        >
      {/each}
    </div>
    {#each views as view (view.id)}
      <span id={view.id} hidden data-view-target></span>
    {/each}
  {/if}

  {#each sections as section, i (section.id)}
    {@const last = i === sections.length - 1}
    <section
      aria-labelledby="listing-{section.id}"
      data-view-section={section.past ? undefined : section.id}
      data-past={section.past || undefined}
      class={i > 0 ? "bg-light" : ""}
    >
      <div bind:this={dividerEls[i]} class={i > 0 ? "bg-light lg:sticky lg:top-0 lg:z-10" : ""}>
        <div
          class="h-10 {i > 0 ? 'lg:h-[100px]' : ''} {i === 1
            ? 'bg-gradient-to-b from-background to-light'
            : ''}"
        ></div>
        <div class={GUTTERS}>
          <!-- 18, not the comp's 20: Figma strokes the 2px rule INSIDE the text
               frame, CSS draws it outside the padding, and the label's cap must
               sit 20 below the rule's top edge either way. Measured: 20 put the
               first card 2px low at both widths. -->
          <div class="border-t-2 border-primary pt-[18px]">
            <h2 id="listing-{section.id}" class="t-h3 text-primary">{section.label}</h2>
          </div>
        </div>
      </div>

      {#if section.past}
        <ListingCarousel
          onready={(carousel) => (carousels[section.id] = carousel)}
          count={section.properties.length}
          label="{section.label} listings"
          enabled={narrow}
          class="{GUTTERS} pt-10 {last ? 'pb-[100px]' : ''}"
        >
          {#snippet children(carousel)}
            {@const on = carousel.enabled}
            <ul
              role={on ? "none" : undefined}
              {...carousel.swipe}
              class={on ? CAROUSEL_LIST : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"}
            >
              {#if on}{@render controls(carousel, false)}{/if}
              {#each section.properties as property, j (property.id)}
                <li {...carousel.slide(j)} class={on ? slideClass(carousel, j) : undefined}>
                  <PropertyCard {property} variant="cream" layout="column" inCarousel={on} />
                </li>
              {/each}
            </ul>
          {/snippet}
        </ListingCarousel>
      {:else}
        {@const points = sectionPoints(section.properties)}
        <!-- The garnet card: whichever listing the centre rule reports, and
             the first until it reports one. The fallback is not defensive: it
             is the whole no-JS, pre-hydration and below-`lg` state — except
             where a carousel draws the comp's tones instead (#14). -->
        {@const featuredId = activeIds[section.id] ?? section.properties[0]?.id}
        <!-- Column 1 is the section's map, 397 × 595 in the comp; `lg:gap-9`
             is its measured 36.0 to the cards. The top pad is the comp's at
             both widths and they differ: 40 from the divider to the first card
             at 1440, but at 390 the map sits 20 below the divider block and
             the first card 20 below the map — so `pt-5` under `lg` whenever
             there is a map to draw, and `lg:pt-10` always. -->
        <div
          style="--sticky-top: {stickyTops[i] !== undefined
            ? `${stickyTops[i]}px`
            : unmeasuredTop(i)}"
          class="{GUTTERS} {points.length > 0 ? 'pt-5' : 'pt-10'} lg:grid
            lg:grid-cols-[397fr_847fr] lg:gap-9 lg:pt-10 {last ? 'pb-[100px]' : ''}"
        >
          {#if points.length > 0}
            <!-- NO z-index here, and that is a correction rather than an
                 omission. This shipped as `lg:z-0` with a comment saying two
                 positioned siblings with `z-index: auto` paint in DOM order, so
                 the later one — the map — would slide over the pinned divider.
                 Half true and the wrong half: the divider is not `auto`, it is
                 `lg:z-10`, and a POSITIVE z-index paints above every `auto`
                 positioned sibling whatever the tree order. Mutating `lg:z-0`
                 away left the browser test green; mutating the divider's
                 `lg:z-10` away turned it red at once, with the map winning the
                 hit test. So the divider's own z-index is what holds the order,
                 and PropertyMap's root `isolate` is what keeps the map's
                 internal `z-[1]`..`z-[3]` from ever competing for it. -->
            <PropertyMap
              {points}
              label={section.label}
              active={activeIds[section.id] ?? null}
              onselect={(id) => revealCard(i, id)}
              class="mb-5 h-50 lg:col-start-1 lg:row-start-1 lg:mb-0 lg:sticky
                lg:[--map-height:595px] lg:h-(--map-height)
                lg:top-[max(var(--sticky-top),calc(50vh-var(--map-height)/2))]"
            />
          {/if}
          <!-- The card column. From `lg`, and with no script, a stacked list
               exactly as before; below `lg` once hydrated, the carousel (see
               the header). In carousel mode the garnet card is the comp's —
               the first section's first listing — and not the centre rule's,
               which does not run there. -->
          <ListingCarousel
            onready={(carousel) => (carousels[section.id] = carousel)}
            count={section.properties.length}
            label="{section.label} listings"
            enabled={narrow}
            class="lg:col-start-2"
          >
            {#snippet children(carousel)}
              {@const on = carousel.enabled}
              {@const garnetId = on
                ? i === 0
                  ? section.properties[0]?.id
                  : undefined
                : featuredId}
              <ul
                bind:this={listEls[i]}
                use:centreWatch={{
                  minWidth: LG,
                  enabled: points.length > 0,
                  onactive: (id) => (activeIds[section.id] = id),
                }}
                use:hoverActivate={{
                  minWidth: LG,
                  enabled: points.length > 0 && !on,
                  onactive: (id) => (activeIds[section.id] = id),
                }}
                role={on ? "none" : undefined}
                {...carousel.swipe}
                class={on ? CAROUSEL_LIST : "flex flex-col gap-5"}
              >
                {#if on}{@render controls(carousel, i === 0 && carousel.index === 0)}{/if}
                {#each section.properties as property, j (property.id)}
                  <!-- `data-centre-id` — the `CENTRE_ID` the action exports,
                   written out because an attribute name is not an expression.
                   The id the centre rule reports, on the CARD's own wrapper:
                   what the map follows is which listing you are looking at, and
                   the <li> is the box that is or is not on the centre line.
                   PropertyListing.test.ts counts these THROUGH the imported
                   constant, so the two cannot drift apart silently.

                   AND IT CARRIES THE EXTRA SCROLL MARGIN A PINNED DIVIDER
                   COSTS. `html { scroll-padding-top }` says where this
                   scrollport's usable top is, and inside a section whose
                   divider pins it is wrong by exactly the difference between
                   the divider and the bar. Measured on a production build at
                   1440x900: a card scrolled to the top of the scrollport — a
                   fragment, or a backward Tab — landed its top at 99.95 with
                   the divider's bottom at 145.41, so 45.45px of it was behind
                   an opaque block.

                   `calc(var(--sticky-top) - var(--usable-top))` is the
                   difference and not a typed 45.4: `--sticky-top` is the same
                   variable the map is offset by (the divider's own measured
                   height, or its CSS-derived fallback), and `--usable-top` is
                   what `scroll-padding-top` already applied. In section 0,
                   where nothing pins, the two are equal and this is 0.
                   `lg:` because none of it pins below that.

                   AND A BOTTOM MARGIN OF `--sticky-top`, so a pin press lands
                   the card on the map's centre (#155). `revealCard` centres
                   the margin box in the window less `scroll-padding-top`:
                   card centre = (U + H)/2 - (mb - mt)/2, which is H/2 — the
                   centred map's middle — only when mb = mt + U = --sticky-top.
                   Without it the card sat 50px low (72.91 under a pinned
                   divider) at 1440x900. -->
                  <li
                    data-centre-id={property.id}
                    {...carousel.slide(j)}
                    class="lg:scroll-mt-[calc(var(--sticky-top)-var(--usable-top))] lg:scroll-mb-[var(--sticky-top)] {on
                      ? slideClass(carousel, j)
                      : ''}"
                  >
                    <PropertyCard
                      {property}
                      variant={property.id === garnetId ? "featured" : i === 0 ? "sand" : "cream"}
                      layout="row"
                      inCarousel={on}
                    />
                  </li>
                {/each}
              </ul>
            {/snippet}
          </ListingCarousel>
        </div>
      {/if}
    </section>
  {/each}
</div>
