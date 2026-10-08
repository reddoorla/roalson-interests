<script lang="ts">
  // The comp's `property` card, three tones. On the Properties page the first
  // section's first listing is the garnet card (6904:2068: off-white text and
  // an off-white-outlined LEARN MORE). Every other card takes
  // whichever light token its section's ground does NOT use, so it always
  // reads as a panel: sand (6913:1982, `#e8e1d1`) on the first section's
  // off-white ground, off-white (6913:2062, `#f2efe9`) on the sand ground the
  // page warms to. The Past Projects grid's card (the comp's Sold card,
  // 6991:1227) is the off-white card with the photo above the text and no
  // button — a past project keeps its page but its card is unlinked (Stage B
  // call 5), and shows only photo, address and bullets (client, 2026-09-25).
  //
  // Anatomy, shared with PropertyDetail: photo box 423.5 × 267.5 beside (or
  // above) a panel padded 20 / 20 / 40; size line over title with the card's
  // 15px gap; 20px between blocks. Every block renders only when its field is
  // filled — and no photo is the common case (three real photos for 22
  // listings), so a photo-less row card gives the panel the full width.
  //
  // AS A CAROUSEL SLIDE (`inCarousel`, #14) the card is laid out by
  // its carousel, not by itself: the article is a SUBGRID of the carousel's
  // grid, the photo takes the first row (the left column from `md` to `lg`) and the
  // panel the last, and the rows between belong to the carousel's bar and
  // arrows, which are its siblings in the DOM and not its children — a
  // control inside a slide goes inert with it (#34). The photo box is drawn
  // even without a photo, so every slide has the same anatomy and the arrows
  // do not jump between a card with a photo and one without.
  import { asLink, isFilled } from "@prismicio/client";
  import { PrismicImage } from "@prismicio/svelte";
  import { cappedWidths } from "@reddoorla/maintenance/images";

  import type { PropertyDocument } from "../../prismicio-types";
  import ArrowRight from "$lib/components/ArrowRight.svelte";
  import {
    BRAND_BUTTON_TONES,
    brandButtonBase,
    brandButtonPadding,
  } from "$lib/components/BrandButton.svelte";
  import { linkResolver } from "$lib/prismicio";
  import { isPastProject, propertyHighlights, statusLabel } from "$lib/property";

  interface Props {
    property: PropertyDocument;
    /** "featured" is the garnet card, one listing per active section (which
     *  one is the caller's call); "sand" and "cream" are the flat card on the
     *  off-white and the sand ground respectively. */
    variant?: "featured" | "sand" | "cream";
    /** "row": photo beside the panel from md up. "column": photo above, as
     *  in the Past Projects grid. "panel": a row from md and a column again
     *  from lg, beside the map. Below md every card is a column. */
    layout?: "row" | "column" | "panel";
    /** One slide of PropertyListing's carousel: see the header. `layout` is
     *  the carousel's then — a column below `md`, a row to `lg`, a column from it. */
    inCarousel?: boolean;
    class?: string;
  }

  let {
    property,
    variant = "cream",
    layout = "row",
    inCarousel = false,
    class: passedClasses = "",
  }: Props = $props();

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
  const past = $derived(isPastProject(property));
  const status = $derived(statusLabel(property));
  const highlights = $derived(propertyHighlights(property));
  const hasPhoto = $derived(isFilled.image(data.feature_image));
  const href = $derived(asLink(property, { linkResolver }));
  const linked = $derived(!past && !!href);
  const CARD_FILL = {
    garnet: "group-hover/card:bg-primary group-hover/card:text-light",
    cream: "group-hover/card:bg-background group-hover/card:text-primary",
  } as const;
  const learnMoreTone = $derived(featured ? "cream" : "garnet");

  // The carousel's placements: rows 1 and 4 of its [photo][bar][arrows][text]
  // below `md`; from `md` the photo spans column 1 and the text is row 3 of
  // column 2. `md:aspect-auto` with the image absolute, so the photo is as
  // tall as the panel beside it and its own pixels size nothing.
  const frame = $derived(
    inCarousel
      ? "col-span-full row-span-full grid grid-cols-subgrid grid-rows-subgrid"
      : `flex flex-col ${layout === "column" ? "" : "md:flex-row"} ${layout === "panel" ? "lg:flex-col" : ""}`,
  );
  const photoBox = $derived(
    inCarousel
      ? "relative row-start-1 aspect-[423.5/267.5] overflow-hidden md:col-start-1 md:row-span-full md:aspect-auto lg:row-span-1 lg:row-start-1"
      : `aspect-[423.5/267.5] shrink-0 overflow-hidden ${layout === "column" ? "" : "md:w-1/2"} ${layout === "panel" ? "lg:w-auto" : ""}`,
  );
  const panel = $derived(
    `flex min-w-0 flex-1 flex-col gap-5 px-5 pt-5 pb-10${
      inCarousel ? " row-start-4 md:col-start-2 md:row-start-3 lg:col-start-1 lg:row-start-4" : ""
    }`,
  );
</script>

<article class="{frame} {tone.card} {linked ? 'group/card relative' : ''} {passedClasses}">
  {#if hasPhoto || inCarousel}
    <div class="{photoBox} {tone.photo}">
      {#if hasPhoto}
        <PrismicImage
          field={data.feature_image}
          fallbackAlt=""
          widths={cappedWidths(data.feature_image)}
          sizes={layout === "panel"
            ? "(min-width: 1440px) 458px, (min-width: 1280px) calc((100vw - 160px) * 0.358), (min-width: 1024px) calc((100vw - 64px) * 0.358), (min-width: 768px) 50vw, 100vw"
            : "(min-width: 1024px) 30vw, (min-width: 768px) 50vw, 100vw"}
          class={inCarousel ? "absolute inset-0 size-full object-cover" : "size-full object-cover"}
        />
      {/if}
    </div>
  {/if}

  <div class={panel}>
    {#if !past && (status || data.is_new)}
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
      {#if !past && data.size_label}
        <p class="t-h4">{data.size_label}</p>
      {/if}
      <h3 class="t-h3">
        {#if linked}
          <a
            {href}
            draggable="false"
            data-card-link
            class="in-[[inert]]:invisible after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-[var(--focus-ring)]"
            >{data.title}</a
          >
        {:else}
          {data.title}
        {/if}
      </h3>
    </div>

    {#if highlights.length}
      <ul class="t-body-2 list-disc ps-[21px]">
        {#each highlights as highlight, i (i)}
          <li>{highlight}</li>
        {/each}
      </ul>
    {/if}

    {#if linked}
      <span
        aria-hidden="true"
        data-card-cta
        class="{brandButtonBase} {BRAND_BUTTON_TONES[learnMoreTone]} {CARD_FILL[
          learnMoreTone
        ]} {brandButtonPadding(true)} self-start"
      >
        Learn more <ArrowRight />
      </span>
    {/if}
  </div>
</article>
