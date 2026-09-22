<script lang="ts">
  // The homepage's "Properties" band (6802:1460 at 1440, 6994:820 at 390): on
  // the #3d0707 ground, a reserved map column beside a sand card that turns
  // through the editor's featured listings — photo, a 2px timer, the eyebrow
  // and arrows, then the listing's size line, title, bullets and LEARN MORE.
  //
  // THE CAROUSEL IS $lib/carousel.svelte.ts — this file owns markup and layout
  // only: no clock, no index, no ARIA of its own. Slider.svelte was read and
  // declined for the reasons that module's header gives. PropertyCard.svelte
  // was read and declined too: its photo is 423.5/267.5 and sits BESIDE the
  // panel from `md`, it has no place for a bar between photo and text, and it
  // takes a whole PropertyDocument where this band holds a relationship's five
  // fields. Its PIECES are reused: the panel's 20/20/40 padding, the 15px
  // size-line/title gap, `t-h4` / `t-h3` / `t-body-2 list-disc ps-[21px]`, and
  // BrandButton with the `sr-only` "about {title}" suffix.
  //
  // ONE GRID, SO THE CHROME CAN SIT BETWEEN A SLIDE'S PHOTO AND ITS TEXT. The
  // comp interleaves them — photo, bar, [eyebrow | arrows], text at 390; the
  // eyebrow-over-arrows column BESIDE the text at 1440 — and the carousel's
  // contract is that controls stay OUTSIDE the slide elements in the DOM: a
  // slide that turns away goes `inert`, and an arrow inside it would turn its
  // own slide from under the keyboard focus it holds (#34). So the card is one
  // grid of four rows (photo / bar / chrome / text), the bar and the chrome are
  // its direct children, and every slide spans all four rows as a SUBGRID,
  // filling rows 1 and 4 and leaving 2 and 3 to the chrome. Each slide is still
  // one element — one APG group, one `inert` — and nothing is positioned over
  // anything: the chrome's real size makes the rows, so an eyebrow that wraps
  // (it does below 376px, where Pause makes the controls 140 wide) moves the
  // text down instead of printing over it. From `lg` the same four rows hold
  // two columns, 414fr | 514fr = the comp's 20 + 394 | 20 + 474 + 20.
  //
  // THE MAP IS DEFERRED (operator call 10, #13). Its column is reserved from
  // `lg` and is nothing but the band's own ground — the comp's map frame has no
  // fill either. Below `lg` it is not rendered: the comp's 390 × 200 box would
  // be 200px of blank scroll. No pins and no captures: those are Google's
  // imagery, and a pin without a map is decoration pretending to be data.
  //
  // THE CARD'S LEFT EDGE IS THE SITE'S COLUMN LINE, not the comp's 512. Every
  // other band puts its right column at x=513 (1440) through the gutters and
  // `[397fr_847fr] gap-9`; the comp draws this one at 512 as a bare 512 : 928
  // ratio. The two are 1px apart at 1440 (513 against 512 — the pixel critic
  // ruling C3 accepts, and why the card measures 927 × 541.41 for the comp's
  // 928 × 542) and drift from there: 6.83px at 1280, where the ratio gives
  // 455.11 and the site's line is 461.94. The column below is the site's
  // arithmetic, so the H1 above and this card share one edge at every width.
  import type { Content } from "@prismicio/client";
  import { cappedWidths } from "@reddoorla/maintenance/images";

  import BrandButton from "$lib/components/BrandButton.svelte";
  import CarouselArrows from "$lib/components/CarouselArrows.svelte";
  import CarouselProgress from "$lib/components/CarouselProgress.svelte";
  import { createCarousel } from "$lib/carousel.svelte";
  import { featuredListings } from "$lib/featured-properties";
  import { DEFAULT_IMAGE_WIDTHS, imgix, srcset } from "$lib/utils/image";

  let { slice }: { slice: Content.FeaturedPropertiesSlice } = $props();

  const uid = $props.id();

  /** The comp's prototype: a 4s SMART_ANIMATE fills the bar, then a 0.5s
   *  DISSOLVE to the next variant (6843:993 → 6843:995 → 6843:1089 …). */
  const DWELL = 4000;
  const DISSOLVE = 500;

  const primary = $derived(slice.primary);
  const listings = $derived(featuredListings(primary.properties));
  const slides = $derived(listings.slides);

  // The visible heading is the comp's H4 eyebrow, at h2 LEVEL: the hero owns
  // the h1 and the slide titles are h3s. It also names the carousel, so an
  // empty field falls back to the comp's words rather than to no name.
  const heading = $derived(primary.heading?.trim() || "Featured Properties");

  // ONE listing is not a carousel: `enabled: false` hands back empty attribute
  // bags, so it renders as a plain card — no roles, no "1 of 1", no swipe —
  // and the arrows and the bar draw nothing on their own (count ≤ 1).
  const carousel = createCarousel({
    count: () => slides.length,
    labelledby: () => `${uid}-heading`,
    autoplay: DWELL,
    settle: DISSOLVE,
    enabled: () => slides.length > 1,
  });

  // The clock's turns dissolve; the user's are instant, as the comp wires its
  // arrows (ON_CLICK → CHANGE_TO, no transition). `rotating` is false whenever
  // the user is driving — a press focuses the control, and focus entering stops
  // the clock — and a transition already running keeps the duration it started
  // with, so a hover mid-dissolve does not cut it short.
  //
  // The photo CROSS-fades: the incoming one fades in over the outgoing one,
  // which holds at 1 and drops out when the fade is done — two photos fading
  // through each other show the ground between them at the halfway mark. The
  // text fades THROUGH (out, then in): two listings' words overlaid are noise.
  // Under reduced motion app.css zeroes every duration and delay: a plain swap.
  const fade = $derived(
    carousel.rotating
      ? {
          photoIn: "opacity-100 transition-opacity duration-500 ease-linear",
          photoOut: "opacity-0 transition-opacity delay-500 duration-0",
          textIn: "opacity-100 transition-opacity delay-[250ms] duration-[250ms]",
          textOut: "opacity-0 transition-opacity duration-[250ms]",
        }
      : {
          photoIn: "opacity-100",
          photoOut: "opacity-0",
          textIn: "opacity-100",
          textOut: "opacity-0",
        },
  );
</script>

{#if slides.length === 0}
  <!-- THE EMPTY STATE IS NO BAND: a dark 827px box around an empty card is a
       broken page, and every listing is still one link away (the hero's and
       the footer's "Our portfolio"). What is left is a hidden marker carrying
       the counts, so "the editor picked nothing showable" and "the API sent the
       picks bare" (`unembedded`, see $lib/featured-properties) can be told
       apart from View Source instead of guessed at. -->
  <section
    hidden
    data-slice-type={slice.slice_type}
    data-slice-variation={slice.variation}
    data-featured-picked={listings.picked}
    data-featured-shown="0"
    data-featured-unembedded={listings.unembedded}
  ></section>
{:else}
  <section
    data-slice-type={slice.slice_type}
    data-slice-variation={slice.variation}
    data-featured-picked={listings.picked}
    data-featured-shown={slides.length}
    data-featured-unembedded={listings.unembedded}
    aria-labelledby={carousel.enabled ? undefined : `${uid}-heading`}
    class="featured-band relative bg-dark lg:grid"
  >
    <!-- The card. With more than one listing it is the carousel's region, named
         by the eyebrow; with one, `region` is empty and the <section> takes the
         name instead (never both — two landmarks, one name).
         `data-carousel-ready` is `hydrated` made visible: what a browser test
         waits on before it presses anything. -->
    <div
      {...carousel.region}
      data-featured-card
      data-carousel-ready={carousel.hydrated ? "" : undefined}
      class="relative isolate bg-light text-primary lg:col-start-2 lg:row-start-1"
    >
      <div
        {...carousel.swipe}
        class="grid grid-cols-1 grid-rows-[auto_auto_auto_1fr] lg:grid-cols-[414fr_514fr]"
      >
        <!-- The chrome comes FIRST in the DOM so Pause is the first stop inside
             the carousel (APG), and sits in row 3 by placement. From `lg` it is
             the comp's 200px column: eyebrow pinned to the top, arrows to the
             bottom, 43 above the card's foot (40 of padding and 3 of the comp's
             own slack — 203 against 200). That column, not the text, is what
             holds the panel at the comp's 285 when a listing has two bullets.
             `items-start`: at 390 the eyebrow's cap top is flush with the
             arrows' top edge, not centred on them.

             `lg:row-start-3` LOOKS redundant beside `row-start-3` and is not.
             `lg:row-span-2` is the `grid-row` SHORTHAND, and inside the `lg`
             media block it lands later in the stylesheet than the unprefixed
             `grid-row-start: 3`, resetting the start to `auto`: the chrome was
             auto-placed into implicit rows 5–6 UNDER the slides (they fill
             rows 1–4 of both columns), and the card measured 1086 tall for the
             comp's 827 with the eyebrow at y=843. Restating the start inside
             `lg` puts it after the shorthand. The text block below needs the
             same pair for the same reason. -->
        <div
          data-featured-chrome
          class="relative z-[2] col-start-1 row-start-3 mx-5 mt-[10px] flex items-start
            justify-between gap-5 lg:row-span-2 lg:row-start-3 lg:mt-5 lg:mr-0 lg:mb-[43px]
            lg:h-[200px] lg:flex-col"
        >
          <h2 id="{uid}-heading" class="t-h4 min-w-0">{heading}</h2>
          <CarouselArrows {carousel} />
        </div>

        <!-- The bar's 2px and the 20 above it are held whether or not there is a
             bar to draw (one listing; no script), so the card is the same card
             in every state. -->
        <div class="relative z-[2] col-span-full row-start-2 mx-5 mt-5 h-0.5">
          <CarouselProgress {carousel} />
        </div>

        {#each slides as slide, i (slide.id)}
          {@const active = carousel.isActive(i)}
          {@const widths = cappedWidths(slide.image, DEFAULT_IMAGE_WIDTHS)}
          <div
            {...carousel.slide(i)}
            data-featured-slide
            class="col-span-full row-span-4 row-start-1 grid grid-cols-subgrid grid-rows-subgrid
              {active ? '' : 'pointer-events-none'}"
          >
            <!-- 928 × 542 at 1440 and 390 × 227.8 at 390: one ratio. Every slide
                 is in the DOM and the band starts below the fold at both widths,
                 so every photo is lazy. Centred; an editor crops in Prismic. -->
            <div
              class="col-span-full row-start-1 aspect-[928/542] overflow-hidden bg-background
                {active ? `z-[1] ${fade.photoIn}` : fade.photoOut}"
            >
              <img
                src={imgix(slide.image.url, { w: Math.min(1920, Math.max(...widths)) })}
                srcset={srcset(slide.image.url, widths)}
                sizes="(min-width: 1024px) 65vw, 100vw"
                width={slide.image.dimensions.width}
                height={slide.image.dimensions.height}
                alt={slide.image.alt ?? ""}
                loading="lazy"
                decoding="async"
                class="size-full object-cover"
              />
            </div>

            <div
              class="col-start-1 row-start-4 mx-5 mt-5 mb-10 flex min-w-0 flex-col gap-5
                lg:col-start-2 lg:row-span-2 lg:row-start-3
                {active ? fade.textIn : fade.textOut}"
            >
              <div class="flex flex-col gap-[15px]">
                {#if slide.sizeLabel}
                  <p class="t-h4">{slide.sizeLabel}</p>
                {/if}
                <h3 class="t-h3">{slide.title}</h3>
              </div>
              {#if slide.highlights.length}
                <ul class="t-body-2 list-disc ps-[21px]">
                  {#each slide.highlights as highlight, j (j)}
                    <li>{highlight}</li>
                  {/each}
                </ul>
              {/if}
              {#if slide.href}
                <BrandButton href={slide.href} arrow class="self-start">
                  Learn more <span class="sr-only">about {slide.title}</span>
                </BrandButton>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if carousel.enabled}
        <p class="sr-only" {...carousel.status}>{carousel.statusText}</p>
      {/if}
    </div>

    <!-- Where the map will mount (#13): the band's own ground and nothing else. -->
    <div
      data-map-slot
      aria-hidden="true"
      class="hidden lg:col-start-1 lg:row-start-1 lg:block"
    ></div>
  </section>
{/if}

<style>
  /* The site's column line, as every gutter-ed band computes it:
     gutter + (content − gap) × 397/1244 + gap, with content capped at 1440 and
     centred. 513px at 1440. Tailwind's `lg` and `xl`, where the gutter changes
     (px-5 sm:px-8 xl:px-20). `100%` is the band's own width, never `vw` — the
     layout is 15px narrower than the viewport wherever a scrollbar takes space. */
  @media (min-width: 64rem) {
    .featured-band {
      --gutter: 2rem;
      grid-template-columns:
        calc(
          max(0px, (100% - 1440px) / 2) + var(--gutter) +
            (min(100%, 1440px) - 2 * var(--gutter) - 36px) * 397 / 1244 + 36px
        )
        minmax(0, 1fr);
    }
  }
  @media (min-width: 80rem) {
    .featured-band {
      --gutter: 5rem;
    }
  }
</style>
