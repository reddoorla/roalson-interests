<script lang="ts">
  // The property page. No frame for it exists anywhere in the Figma file, so it
  // is composed from the comp's own system (operator call, 2026-09-18): the
  // property CARD's anatomy scaled to a page — photo beside a sand panel,
  // eyebrow over title with the card's 15px gap, 20px between blocks, the
  // card's bullets and its `button dark`. The Details tab's facts and tracts
  // are bullets in the same list (Erik, 2026-10-09), so there is no Details
  // section.
  //
  // Every block renders only when its fields are filled: most listings fill
  // fewer than half of the Details tab, and an empty label is noise.
  //
  // A past project keeps its page (unlinked, noindex) but it is a record, not
  // an offer: a "Past project" tag in place of the status, and no package,
  // price bullets or tracts (its tracts carry sale status).
  import { isFilled } from "@prismicio/client";
  import { PrismicImage } from "@prismicio/svelte";
  import { cappedWidths } from "@reddoorla/maintenance/images";

  import type { PropertyDocument } from "../../prismicio-types";
  import ArrowRight from "$lib/components/ArrowRight.svelte";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import {
    aerialMapUrl,
    detailBullets,
    isPastProject,
    propertyPackage,
    statusLabel,
  } from "$lib/property";

  interface Props {
    property: PropertyDocument;
    class?: string;
  }

  let { property, class: passedClasses = "" }: Props = $props();

  const data = $derived(property.data);
  const past = $derived(isPastProject(property));
  const status = $derived(past ? "Past project" : statusLabel(property));
  const isNew = $derived(!past && data.is_new);
  const bullets = $derived(detailBullets(property));
  const pkg = $derived(past ? null : propertyPackage(property));
  const map = $derived(aerialMapUrl(property));
  const hasPhoto = $derived(isFilled.image(data.feature_image));
</script>

<article
  class="px-4 pt-10 pb-20 text-primary sm:px-8 xl:px-20 {passedClasses}"
  aria-labelledby="property-title"
>
  <a href="/properties" class="t-h6 inline-flex items-center gap-[5px] hover:underline">
    <ArrowRight class="rotate-180" />
    All properties
  </a>

  <!-- Without a photo the panel takes the full width rather than sitting
       beside an empty box: only three real client photos exist for the 22
       listings, so no-photo is the COMMON case, not an edge. -->
  <div class="mt-10 grid {hasPhoto ? 'lg:grid-cols-2' : ''}">
    {#if hasPhoto}
      <!-- The card's photo box, 423.5 × 267.5 in the comp. -->
      <div class="aspect-[423.5/267.5] overflow-hidden bg-light lg:self-stretch">
        <PrismicImage
          field={data.feature_image}
          fallbackAlt=""
          widths={cappedWidths(data.feature_image)}
          sizes="(min-width: 1024px) 50vw, 100vw"
          class="size-full object-cover"
        />
      </div>
    {/if}

    <div class="flex flex-col gap-5 bg-light px-5 pt-5 pb-10 lg:px-10 lg:pt-10">
      {#if data.category || isNew || status}
        <ul class="flex flex-wrap items-center gap-2.5" aria-label="Listing status">
          {#if status}
            <li class="bg-primary px-2.5 py-2.5 text-light">
              <span class="t-h5 block">{status}</span>
            </li>
          {/if}
          {#if isNew}
            <li class="bg-primary px-2.5 py-2.5 text-light"><span class="t-h5 block">New</span></li>
          {/if}
          {#if data.category}
            <li><span class="t-h5 block text-secondary">{data.category}</span></li>
          {/if}
        </ul>
      {/if}

      <div class="flex flex-col gap-[15px]">
        {#if data.size_label}
          <p class="t-h4">{data.size_label}</p>
        {/if}
        <h1 id="property-title" class="t-h2">{data.title}</h1>
      </div>

      {#if bullets.length}
        <ul class="t-body-1 list-disc ps-[21px]">
          {#each bullets as bullet, i (i)}
            <li>{bullet}</li>
          {/each}
        </ul>
      {/if}

      {#if pkg || map}
        <div class="flex flex-wrap items-center gap-2.5">
          {#if pkg}
            <BrandButton href={pkg.url} arrow target="_blank" rel="noopener noreferrer">
              Property package
              <span class="sr-only">(PDF, opens in a new tab)</span>
            </BrandButton>
          {/if}
          {#if map}
            <BrandButton href={map} arrow target="_blank" rel="noopener noreferrer">
              Aerial Map
              <span class="sr-only">(Google Maps, opens in a new tab)</span>
            </BrandButton>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</article>
