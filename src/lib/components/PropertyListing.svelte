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
  // Not here yet, each with its own issue: the per-section map that fills the
  // left column (#13), and the 390 comp's in-card carousel (#14 — this stacks
  // the cards, which is also that carousel's no-JS state).
  import PropertyCard from "$lib/components/PropertyCard.svelte";
  import type { ListingSection } from "$lib/property-listing";

  interface Props {
    sections: ListingSection[];
    class?: string;
  }

  let { sections, class: passedClasses = "" }: Props = $props();

  // The comp's gutters: 20 at 390, 80 at 1440 (PropertyDetail's 16 predates
  // the 390 frame being read).
  const GUTTERS = "mx-auto max-w-[1440px] px-5 sm:px-8 xl:px-20";
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
      <div class={i > 0 ? "bg-light lg:sticky lg:top-0 lg:z-10" : ""}>
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
        <!-- Column 1 is the section's map, 397 × 595 in the comp. No map ships
             in this batch (#13), so the column is reserved rather than closed
             up: the listing stays at the comp's x and the map drops in later. -->
        <div
          class="{GUTTERS} pt-10 lg:grid lg:grid-cols-[397fr_847fr] lg:gap-9 {last
            ? 'pb-[100px]'
            : ''}"
        >
          <ul class="flex flex-col gap-5 lg:col-start-2">
            {#each section.properties as property, j (property.id)}
              <li>
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
