<script lang="ts">
  // The comp's `property` card, three tones. On the Properties page the FIRST
  // listing of each active section is the garnet card (6904:2068: off-white
  // text and an off-white-outlined LEARN MORE). Every later card takes
  // whichever light token its section's ground does NOT use, so it always
  // reads as a panel: sand (6913:1982, `#e8e1d1`) on the first section's
  // off-white ground, off-white (6913:2062, `#f2efe9`) on the sand ground the
  // page warms to. The Sold grid's card (6991:1227) is the off-white card with
  // the photo above the text and no button — a sold listing keeps its page but
  // its card is unlinked (Stage B call 5).
  //
  // Anatomy, shared with PropertyDetail: photo box 423.5 × 267.5 beside (or
  // above) a panel padded 20 / 20 / 40; size line over title with the card's
  // 15px gap; 20px between blocks. Every block renders only when its field is
  // filled — and no photo is the common case (three real photos for 22
  // listings), so a photo-less row card gives the panel the full width.
  import { asLink, isFilled } from "@prismicio/client";
  import { PrismicImage } from "@prismicio/svelte";
  import { cappedWidths } from "@reddoorla/maintenance/images";

  import type { PropertyDocument } from "../../prismicio-types";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import { linkResolver } from "$lib/prismicio";
  import { isSold, propertyHighlights, statusLabel } from "$lib/property";

  interface Props {
    property: PropertyDocument;
    /** "featured" is the garnet card, the first listing of each active
     *  section; "sand" and "cream" are the flat card on the off-white and the
     *  sand ground respectively. */
    variant?: "featured" | "sand" | "cream";
    /** "row": photo beside the panel from md up, as in the listing column.
     *  "column": photo above, as in the Sold grid. Below md every card is a
     *  column; the 390 comp stacks them. */
    layout?: "row" | "column";
    class?: string;
  }

  let { property, variant = "cream", layout = "row", class: passedClasses = "" }: Props = $props();

  const featured = $derived(variant === "featured");
  const TONES = {
    featured: {
      card: "bg-primary text-background",
      photo: "bg-dark",
      badge: "bg-background text-primary",
    },
    sand: { card: "bg-light text-primary", photo: "bg-background", badge: "bg-primary text-light" },
    cream: {
      card: "bg-background text-primary",
      photo: "bg-light",
      badge: "bg-primary text-light",
    },
  } as const;
  const tone = $derived(TONES[variant]);

  const data = $derived(property.data);
  const sold = $derived(isSold(property));
  const status = $derived(statusLabel(property));
  const highlights = $derived(propertyHighlights(property));
  const hasPhoto = $derived(isFilled.image(data.feature_image));
  const href = $derived(asLink(property, { linkResolver }));
</script>

<article class="flex flex-col {layout === 'row' ? 'md:flex-row' : ''} {tone.card} {passedClasses}">
  {#if hasPhoto}
    <div
      class="aspect-[423.5/267.5] shrink-0 overflow-hidden {layout === 'row'
        ? 'md:w-1/2'
        : ''} {tone.photo}"
    >
      <PrismicImage
        field={data.feature_image}
        fallbackAlt=""
        widths={cappedWidths(data.feature_image)}
        sizes="(min-width: 1024px) 30vw, (min-width: 768px) 50vw, 100vw"
        class="size-full object-cover"
      />
    </div>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col gap-5 px-5 pt-5 pb-10">
    {#if status || data.is_new}
      <ul class="flex flex-wrap items-center gap-2.5" aria-label="Listing status">
        {#if status}
          <li class={tone.badge}>
            <span class="t-h5 block px-2.5 py-2.5">{status}</span>
          </li>
        {/if}
        {#if data.is_new}
          <li class={tone.badge}>
            <span class="t-h5 block px-2.5 py-2.5">New</span>
          </li>
        {/if}
      </ul>
    {/if}

    <div class="flex flex-col gap-[15px]">
      {#if data.size_label}
        <p class="t-h4">{data.size_label}</p>
      {/if}
      <h3 class="t-h3">{data.title}</h3>
    </div>

    {#if highlights.length}
      <ul class="t-body-2 list-disc ps-[21px]">
        {#each highlights as highlight, i (i)}
          <li>{highlight}</li>
        {/each}
      </ul>
    {/if}

    {#if !sold && href}
      <BrandButton {href} arrow tone={featured ? "cream" : "garnet"} class="self-start">
        Learn more <span class="sr-only">about {data.title}</span>
      </BrandButton>
    {/if}
  </div>
</article>
