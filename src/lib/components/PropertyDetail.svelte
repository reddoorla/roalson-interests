<script lang="ts">
  // The property page. No frame for it exists anywhere in the Figma file, so it
  // is composed from the comp's own system (operator call, 2026-09-18): the
  // property CARD's anatomy scaled to a page — photo beside a sand panel,
  // eyebrow over title with the card's 15px gap, 20px between blocks, the
  // card's bullets and its `button dark` — then the Properties page's section
  // divider (a garnet rule over an H3 label) heading the facts.
  //
  // Every block renders only when its fields are filled: most listings fill
  // fewer than half of the Details tab, and an empty label is noise.
  import { isFilled } from "@prismicio/client";
  import { PrismicImage } from "@prismicio/svelte";
  import { cappedWidths } from "@reddoorla/maintenance/images";

  import type { PropertyDocument } from "../../prismicio-types";
  import ArrowRight from "$lib/components/ArrowRight.svelte";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import {
    mapsUrl,
    propertyFacts,
    propertyHighlights,
    propertyPackage,
    propertyTracts,
    statusLabel,
  } from "$lib/property";

  interface Props {
    property: PropertyDocument;
    class?: string;
  }

  let { property, class: passedClasses = "" }: Props = $props();

  const data = $derived(property.data);
  const status = $derived(statusLabel(property));
  const highlights = $derived(propertyHighlights(property));
  const facts = $derived(propertyFacts(property));
  const tracts = $derived(propertyTracts(property));
  const pkg = $derived(propertyPackage(property));
  const map = $derived(mapsUrl(property));
</script>

<article
  class="px-4 pt-10 pb-20 text-primary sm:px-8 xl:px-20 {passedClasses}"
  aria-labelledby="property-title"
>
  <a href="/properties" class="t-h6 inline-flex items-center gap-[5px] hover:underline">
    <ArrowRight class="rotate-180" />
    All properties
  </a>

  <div class="mt-10 grid lg:grid-cols-2">
    <!-- The card's photo box, 423.5 × 267.5 in the comp. -->
    <div class="aspect-[423.5/267.5] overflow-hidden bg-light">
      {#if isFilled.image(data.feature_image)}
        <PrismicImage
          field={data.feature_image}
          fallbackAlt=""
          widths={cappedWidths(data.feature_image)}
          sizes="(min-width: 1024px) 50vw, 100vw"
          class="size-full object-cover"
        />
      {/if}
    </div>

    <div class="flex flex-col gap-5 bg-light px-5 pt-5 pb-10 lg:px-10 lg:pt-10">
      {#if data.category || data.is_new || status}
        <ul class="flex flex-wrap items-center gap-2.5" aria-label="Listing status">
          {#if status}
            <li class="bg-primary px-2.5 py-2.5 text-light">
              <span class="t-h5 block">{status}</span>
            </li>
          {/if}
          {#if data.is_new}
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

      {#if highlights.length}
        <ul class="t-body-1 list-disc ps-[21px]">
          {#each highlights as highlight, i (i)}
            <li>{highlight}</li>
          {/each}
        </ul>
      {/if}

      {#if pkg || map}
        <div class="flex flex-wrap items-center gap-2.5">
          {#if pkg}
            <BrandButton href={pkg.url} arrow>
              Property package
              <span class="sr-only">(PDF{pkg.size ? `, ${pkg.size}` : ""})</span>
            </BrandButton>
          {/if}
          {#if map}
            <BrandButton href={map} arrow target="_blank" rel="noopener noreferrer">
              View on Google Maps
              <span class="sr-only">(opens in a new tab)</span>
            </BrandButton>
          {/if}
        </div>
        {#if pkg}
          <p class="t-body-2 text-secondary" aria-hidden="true">
            PDF{pkg.size ? ` · ${pkg.size}` : ""}
          </p>
        {/if}
      {/if}
    </div>
  </div>

  {#if facts.length || tracts.length}
    <section class="mt-20 border-t border-primary pt-5" aria-labelledby="property-details">
      <h2 id="property-details" class="t-h3 mt-5">Details</h2>

      {#if facts.length}
        <dl class="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {#each facts as fact (fact.label)}
            <div class="flex flex-col gap-[15px]">
              <dt class="t-h5 text-secondary">{fact.label}</dt>
              <dd class="t-body-1">{fact.value}</dd>
            </div>
          {/each}
        </dl>
      {/if}

      {#if tracts.length}
        <table class="t-body-1 mt-10 w-full max-w-2xl border-collapse text-left">
          <caption class="t-h5 pb-5 text-left text-secondary">Tracts</caption>
          <thead>
            <tr class="border-b border-primary">
              <th scope="col" class="t-h6 py-2.5 font-semibold">Tract</th>
              <th scope="col" class="t-h6 py-2.5 font-semibold">Acres</th>
              <th scope="col" class="t-h6 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each tracts as tract, i (i)}
              <tr class="border-b border-light">
                <th scope="row" class="py-2.5 font-normal">{tract.name}</th>
                <td class="py-2.5">{tract.acres ?? "—"}</td>
                <td class="py-2.5">{tract.status}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}
</article>
