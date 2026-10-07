<script lang="ts">
  // The Properties page body: the comp's stacked sections (6903:1030 at 1440,
  // 6992:2468 at 390), each a divider — a 2px garnet rule over an H3 label —
  // and its listing. Active sections pair a map with their listings (below);
  // Past Projects (the comp's Sold section)
  // is a 3×2 grid of unlinked off-white cards across the full width
  // (6991:1145).
  //
  // THE VIEW TABS (P5, 2026-09-25: "land / improved projects / all") are links
  // to a fragment, and app.css filters by `:target` — so they work with no
  // script, on first paint of a shared `/properties#land`, and with Back. The
  // targets are empty `hidden` spans, so following one scrolls nothing. Once
  // hydrated, `data-view` holds the view and the CSS reads that instead, so a
  // fragment that is not a view (the skip link's) leaves it alone. A hidden
  // section stays in the DOM and its map keeps its state. Past Projects has no view and shows under every tab.
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
  // THE MAP AND ITS PANEL (Option 1, Nicole's "Full Screen Map" frame
  // 7153:969, chosen 2026-10-06). From `lg` an active section is the map,
  // 925 of the 1440 column from its left edge, beside a 515 panel that
  // shows one listing at a time. The panel is the same carousel phones have
  // had since #14, laid out as one column: photo, bar, arrows, text.
  //
  // THE MAP HOLDS STILL. Erik's list (2026-10-05): "the map constantly moving
  // in and out is a bit wonky". `follow={false}` keeps the camera on its
  // opening frame. The listing on stage is the active pin (grown, the rest
  // dimmed), a pin press turns the carousel to its card, and only the
  // visitor's own zoom or pan moves the camera.
  //
  // WITH NO SCRIPT, and for a section of one listing, the list is stacked
  // beside a sticky map. The sticky offsets below serve that state, and the
  // panel's scroll margin under a pinned divider.
  import { onMount } from "svelte";

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
  const MAP_SECTION = "mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-0";

  /** Where Past Projects is a carousel: the exact complement of Tailwind's
   *  `lg`, `(width >= 64rem)`, so script and the stylesheet agree on which
   *  layout is on screen at every width and font-size setting. Written as a
   *  range, not `max-width`, so that nothing between 1023 and 1024 is both. */
  const BELOW_LG = "(width < 64rem)";

  /** The listing grid a carousel lays its list out on: [photo][bar][arrows]
   *  [text] below `md`, the photo beside the other three from `md`, and one
   *  column again from `lg`, where the photo takes what the map's height
   *  leaves and never less than 12rem. Every slide is as tall as the tallest,
   *  so the arrows never move between cards. */
  const CAROUSEL_LIST =
    "grid grid-cols-1 grid-rows-[auto_auto_auto_1fr] md:grid-cols-2 md:grid-rows-[auto_auto_1fr] lg:min-h-(--map-height) lg:grid-cols-1 lg:grid-rows-[minmax(12rem,1fr)_auto_auto_auto]";

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
    const sync = () => {
      narrow = query.matches;
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  });

  /** Each section's carousel, by section id. Raw state: an instance is a bag
   *  of getters that must not be proxied. */
  let carousels = $state.raw<Record<string, Carousel>>({});
  const keepCarousel = (id: string, carousel: Carousel) => {
    carousels = { ...carousels, [id]: carousel };
  };

  let pending: Record<string, number> = {};

  function applyPending() {
    for (const [id, index] of Object.entries(pending)) {
      const carousel = carousels[id];
      if (!carousel?.enabled) continue;
      carousel.goTo(index);
      delete pending[id];
    }
  }

  export function capture(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(carousels)
        .filter(([, carousel]) => carousel.enabled)
        .map(([id, carousel]) => [id, carousel.index]),
    );
  }

  export function restore(saved: Record<string, number>) {
    pending = { ...saved };
    applyPending();
  }

  $effect(() => {
    for (const carousel of Object.values(carousels)) void carousel.enabled;
    applyPending();
  });

  let hydrated = $state(false);

  const activeFor = (section: ListingSection): string | null => {
    const carousel = carousels[section.id];
    if (carousel?.enabled) return section.properties[carousel.index]?.id ?? null;
    return hydrated && section.properties.length === 1 ? section.properties[0]!.id : null;
  };

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

  const views = $derived(listingViews(sections));
  /** The view, once hydrated; undefined on the server, where `:target` rules. */
  let current = $state<ListingView | undefined>();
  onMount(() => {
    current = viewFromHash(location.hash) ?? "all";
    hydrated = true;
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

  function revealCard(sectionIndex: number, id: string) {
    const list = listEls[sectionIndex];
    if (!list) return;
    const cards = [...list.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.dataset.centreId !== undefined,
    );
    const card = cards.find((child) => child.dataset.centreId === id);
    if (!card) return;
    const carousel = carousels[sections[sectionIndex]?.id ?? ""];
    if (carousel?.enabled) {
      carousel.goTo(cards.indexOf(card));
      list.scrollIntoView?.({ block: "nearest" });
      return;
    }
    card.scrollIntoView?.({ block: "nearest" });
  }
</script>

<svelte:window {onhashchange} />

<!-- A carousel's bar and arrows (#14): rows 2 and 3 of CAROUSEL_LIST, the
     top of column 2 from `md`, and rows 2 and 3 of the one column from `lg`. They are the grid's OWN items, never inside a
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
    class="relative z-[2] col-start-1 row-start-2 mx-5 mt-5 h-0.5 md:col-start-2 md:row-start-1 lg:col-start-1 lg:row-start-2"
  >
    <CarouselProgress {carousel} {tone} />
  </li>
  <li
    role="none"
    class="relative z-[2] col-start-1 row-start-3 mx-5 mt-[10px] flex justify-end md:col-start-2 md:row-start-2 lg:col-start-1 lg:row-start-3
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
          onready={(carousel) => keepCarousel(section.id, carousel)}
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
        <div
          style="--sticky-top: {stickyTops[i] !== undefined
            ? `${stickyTops[i]}px`
            : unmeasuredTop(i)}"
          class="{MAP_SECTION} {points.length > 0 ? 'pt-5' : 'pt-10'} lg:grid
            lg:grid-cols-[925fr_515fr] lg:pt-10 lg:[--map-height:min(57.43vw,827px,calc(100svh-var(--sticky-top)-20px))] {last
            ? 'pb-[100px]'
            : ''}"
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
              active={activeFor(section)}
              follow={false}
              onselect={(id) => revealCard(i, id)}
              class="mb-5 h-50 lg:col-start-1 lg:row-start-1 lg:mb-0 lg:sticky
                lg:h-(--map-height)
                lg:top-[max(var(--sticky-top),calc(50vh-var(--map-height)/2))]"
            />
          {/if}
          <ListingCarousel
            onready={(carousel) => keepCarousel(section.id, carousel)}
            count={section.properties.length}
            label="{section.label} listings"
            enabled={hydrated}
            class="lg:col-start-2"
          >
            {#snippet children(carousel)}
              {@const on = carousel.enabled}
              {@const lead = i === 0 || current === section.id}
              {@const garnetId = lead ? section.properties[0]?.id : undefined}
              <ul
                bind:this={listEls[i]}
                role={on ? "none" : undefined}
                {...carousel.swipe}
                class="lg:scroll-mt-[calc(var(--sticky-top)-var(--usable-top))] {on
                  ? CAROUSEL_LIST
                  : 'flex flex-col gap-5'}"
              >
                {#if on}{@render controls(carousel, lead && carousel.index === 0)}{/if}
                {#each section.properties as property, j (property.id)}
                  <li
                    data-centre-id={property.id}
                    {...carousel.slide(j)}
                    class="lg:scroll-mt-[calc(var(--sticky-top)-var(--usable-top))] {on
                      ? slideClass(carousel, j)
                      : ''}"
                  >
                    <PropertyCard
                      {property}
                      variant={property.id === garnetId ? "featured" : i === 0 ? "sand" : "cream"}
                      layout="panel"
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
