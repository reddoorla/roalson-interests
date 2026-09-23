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
  //    grid top 476.02, grid height 1092.39, map 595 — so 497.39px of travel,
  //    stuck from scrollY 376.02 to 873.41, and at scrollY 900 the map's top
  //    reads 73.4 (= 100 - 26.6 of overshoot). Exactly the predicted release.
  //    On the real portfolio the land section gives 4499.86px of travel and
  //    the improved section 873.63.
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

  /** What `--sticky-top` holds until the first measurement — app.css's own
   *  `scroll-padding-top` at `lg`, which is the bar plus 20px of air. It is
   *  never the answer for a pinned divider; it is what a map is offset by for
   *  the one frame before `measure()` runs, and on a server render, where
   *  nothing is scrolled and nothing is stuck. */
  const UNMEASURED_TOP = 100;

  let dividerEls = $state<(HTMLElement | undefined)[]>([]);
  let listEls = $state<(HTMLElement | undefined)[]>([]);
  let stickyTops = $state<number[]>([]);
  /** Section id → the listing id on the centre line. */
  let activeIds = $state<Record<string, string>>({});

  function usableTop(): number {
    const declared = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
    return Number.isFinite(declared) ? declared : UNMEASURED_TOP;
  }

  function measure() {
    stickyTops = sections.map((_, i) => {
      // Section 0's divider is deliberately NOT sticky (see the comp note
      // above), so its height says nothing about what is pinned over its map.
      const el = i > 0 ? dividerEls[i] : undefined;
      // A ZERO HEIGHT IS NOT A MEASUREMENT. Under jsdom every box is 0, and in
      // a browser this can be asked before first layout; either way `top: 0`
      // would pin the map against the very top of the window, under the bar.
      // Falling back to the declared usable top is the honest answer to "I
      // could not measure it".
      const measured = el ? el.getBoundingClientRect().height : 0;
      return measured > 0 ? measured : usableTop();
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
          style="--sticky-top: {stickyTops[i] ?? UNMEASURED_TOP}px"
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
                   constant, so the two cannot drift apart silently. -->
              <li data-centre-id={property.id}>
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
