<script lang="ts">
  // The Properties page body: the comp's stacked sections (6903:1030 at 1440,
  // 6992:2468 at 390), each a divider — a 2px garnet rule over an H3 label —
  // and its listing. Active sections put the listing in the comp's right
  // column (847 of 1280) with the first card featured and the rest in the light
  // token their ground does not use; the Sold section is a 3×2 grid of
  // unlinked off-white cards across the full width (6991:1145).
  //
  // Two of the comp's mechanisms belong to this component and are page-level:
  //
  // - The dividers PIN. From the second section on, the divider is sticky with
  //   the comp's 100px top pad, which lands its rule 20px under the 80px nav;
  //   the first divider (6909:1956, 40px pad) does not pin, and none pin on
  //   mobile — exactly what the prototype's STICKY_SCROLLS flags say.
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
  // different box. The box is what PropertyMap measures to decide its pin size
  // and whether to draw the expand affordance, so the switch is CSS here and
  // nothing in this file consults a breakpoint twice.
  //
  // TOP-ALIGNED, NEVER STRETCHED. The comp holds the panel at 595 beside a
  // 5-card list 1457.48 tall, so `lg:h-[595px]` and no `h-full`/`self-stretch`
  // — the grid's default `stretch` would grow the map to the list's height.
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
  // WHICH LISTING IS ACTIVE HAS ONE ANSWER: the card crossing the middle of
  // the screen. Pressing a pin does NOT set it — the press scrolls that card
  // to the centre and the same rule then reports it. See centreWatch.ts.
  //
  // AND NOTHING HERE HOLDS THAT RULE BACK WHILE A SCROLL TRAVELS. It used to —
  // see `revealCard` for the two separate defects that cost — and the job now
  // belongs to the camera, which coalesces while the document is moving
  // ($lib/scroll-activity, `cameraMove`'s `page-scrolling`). This component is
  // back to reporting which card is in the middle, whatever put it there.
  //
  // Still not here: the 390 comp's in-card carousel (#14 — this stacks the
  // cards, which is also that carousel's no-JS state).
  import { centreWatch } from "$lib/actions/centreWatch";
  import PropertyCard from "$lib/components/PropertyCard.svelte";
  import PropertyMap from "$lib/components/PropertyMap.svelte";
  import type { ListingSection } from "$lib/property-listing";
  import { sectionPoints } from "$lib/property-map";

  interface Props {
    sections: ListingSection[];
    class?: string;
  }

  let { sections, class: passedClasses = "" }: Props = $props();

  // The comp's gutters: 20 at 390, 80 at 1440 (PropertyDetail's 16 predates
  // the 390 frame being read).
  const GUTTERS = "mx-auto max-w-[1440px] px-5 sm:px-8 xl:px-20";

  /** `--screen-lg` (app.css). The one breakpoint this file pins at. */
  const LG = 1024;

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
   * top), every later one does (its map lands on the divider). Both come from
   * app.css, which is where this site says where its usable top is.
   */
  const UNMEASURED_TOP = "var(--usable-top)";
  const UNMEASURED_PINNED_TOP = "var(--listing-divider-top)";
  const unmeasuredTop = (i: number) => (i > 0 ? UNMEASURED_PINNED_TOP : UNMEASURED_TOP);

  let dividerEls = $state<(HTMLElement | undefined)[]>([]);
  let listEls = $state<(HTMLElement | undefined)[]>([]);
  /** Per section: the MEASURED offset in px, or undefined where nothing has
   *  been measured yet — in which case the CSS fallback above stands. */
  let stickyTops = $state<(number | undefined)[]>([]);
  /** Section id → the listing id on the centre line. */
  let activeIds = $state<Record<string, string>>({});

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
      if (measured > 0) return measured;
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
   *  AND THAT IS ALL IT DOES. This function used to also suspend the centre
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
   *  `page-scrolling`, over `$lib/scroll-activity` — and the press is not a
   *  case in it, it is just another scroll.
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
  function revealCard(sectionIndex: number, id: string) {
    const list = listEls[sectionIndex];
    if (!list) return;
    for (const child of list.children) {
      if ((child as HTMLElement).dataset.centreId !== id) continue;
      (child as HTMLElement).scrollIntoView?.({ block: "center" });
      return;
    }
  }
</script>

<div class={passedClasses}>
  {#if sections.length === 0}
    <p class="t-body-1 {GUTTERS} py-20 text-primary">
      No properties are listed at the moment. Please check back soon.
    </p>
  {/if}

  {#each sections as section, i (section.id)}
    {@const last = i === sections.length - 1}
    <section aria-labelledby="listing-{section.id}" class={i > 0 ? "bg-light" : ""}>
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

      {#if section.sold}
        <ul
          class="{GUTTERS} grid gap-5 pt-10 sm:grid-cols-2 lg:grid-cols-3 {last
            ? 'pb-[100px]'
            : ''}"
        >
          {#each section.properties as property (property.id)}
            <li><PropertyCard {property} variant="cream" layout="column" /></li>
          {/each}
        </ul>
      {:else}
        {@const points = sectionPoints(section.properties)}
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
                lg:top-[var(--sticky-top)] lg:h-[595px]"
            />
          {/if}
          <ul
            bind:this={listEls[i]}
            use:centreWatch={{
              minWidth: LG,
              enabled: points.length > 0,
              onactive: (id) => (activeIds[section.id] = id),
            }}
            class="flex flex-col gap-5 lg:col-start-2"
          >
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
                   `lg:` because none of it pins below that. -->
              <li
                data-centre-id={property.id}
                class="lg:scroll-mt-[calc(var(--sticky-top)-var(--usable-top))]"
              >
                <PropertyCard
                  {property}
                  variant={j === 0 ? "featured" : i === 0 ? "sand" : "cream"}
                  layout="row"
                />
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/each}
</div>
