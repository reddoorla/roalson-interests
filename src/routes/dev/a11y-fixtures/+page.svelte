<script lang="ts">
  import type { Content, ImageField } from "@prismicio/client";
  import Accordion from "$lib/components/Accordion.svelte";
  import BrandIcon from "$lib/components/BrandIcon.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Form from "$lib/components/Form.svelte";
  import Field from "$lib/components/Field.svelte";
  import HeroBackgroundImage from "$lib/components/HeroBackgroundImage.svelte";
  import Img from "$lib/components/Img.svelte";
  import ScreenWidthMedia from "$lib/components/ScreenWidthMedia.svelte";
  import VimeoBanner from "$lib/components/VimeoBanner.svelte";
  import RichTextBody from "$lib/components/RichTextBody.svelte";
  import Slider from "$lib/components/Slider.svelte";
  import CountUp from "$lib/components/CountUp.svelte";
  import Hero from "$lib/slices/Hero/index.svelte";
  import MediaText from "$lib/slices/MediaText/index.svelte";
  import SectionGrid from "$lib/slices/SectionGrid/index.svelte";
  import LeadText from "$lib/slices/LeadText/index.svelte";
  import TextColumns from "$lib/slices/TextColumns/index.svelte";
  import Testimonial from "$lib/slices/Testimonial/index.svelte";
  import CtaBanner from "$lib/slices/CtaBanner/index.svelte";
  import HomeHero from "$lib/slices/HomeHero/index.svelte";
  import Partners from "$lib/slices/Partners/index.svelte";
  import { partnersFixtureState } from "$lib/home-fixture";
  import PropertyDetail from "$lib/components/PropertyDetail.svelte";
  import PageMasthead from "$lib/components/PageMasthead.svelte";
  import PropertyListing from "$lib/components/PropertyListing.svelte";
  import { homeHeroFixture } from "$lib/home-fixture";
  import { HOME_PHOTO_FIXTURE, photoBandFixture } from "$lib/home-fixture";
  import PhotoBand from "$lib/slices/PhotoBand/index.svelte";
  import {
    PROPERTIES_MASTHEAD_FIXTURE,
    propertyFixture,
    propertyListingFixture,
  } from "$lib/property-fixture";
  import { groupListings } from "$lib/property-listing";
  // Aliased: `Accordion` above is the primitive ($lib/components/Accordion.svelte).
  import AccordionSlice from "$lib/slices/Accordion/index.svelte";
  import type { ComponentProps } from "svelte";
  import { trapFocus } from "$lib/actions/trapFocus";
  import CarouselFixture from "./CarouselFixture.svelte";
  import FeaturedProperties from "$lib/slices/FeaturedProperties/index.svelte";
  import { featuredLaunchFixture, featuredPropertiesFixture } from "$lib/home-fixture";
  import type { RichTextField } from "@prismicio/client";

  let modalOpen = $state(false);
  let trapDemoOpen = $state(false);
  let email = $state("");
  let message = $state("");

  // Inline pixel so media fixtures stay hermetic — the axe run must not
  // depend on external hosts (Prismic, Vimeo).
  const pixel = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  const heroImage = {
    url: pixel,
    alt: "Placeholder hero image",
    dimensions: { width: 1920, height: 1080 },
  } as unknown as ImageField;
  const runImport = { img: { src: pixel, w: 1920, h: 1080 }, sources: {} };

  const items = [
    {
      label: "What is this page?",
      content: "A fixtures page exercising accessible component primitives for axe testing.",
    },
    {
      label: "What does it cover?",
      content:
        "Focus trap (custom dialog overlay), Accordion (disclosure), Modal (dialog), Form, Field, and rich-text heading normalization.",
    },
  ];

  // An editor-authored body that starts deep and skips a level (h3 → h5);
  // RichTextBody compresses the announced levels to 2 and 3.
  const richTextField = [
    { type: "heading3", text: "Editor heading (h3 tag)", spans: [] },
    {
      type: "paragraph",
      text: "The h3 above is announced as level 2 via aria-level.",
      spans: [],
    },
    { type: "heading5", text: "Skipped to h5 (h5 tag)", spans: [] },
    {
      type: "paragraph",
      text: "The h5 above is announced as level 3 — no gap in the outline.",
      spans: [],
    },
  ] as unknown as RichTextField;

  // Prismic slice fixtures. Images use the inline pixel (hermetic — no
  // external hosts). Headings are h2 (slice sections) / h3 (items) so the page
  // outline stays valid beneath the page <h1>.
  const heroSliceFixture = {
    slice_type: "hero",
    variation: "default",
    primary: {
      heading: [{ type: "heading2", text: "Hero slice", spans: [] }],
      body: [
        {
          type: "paragraph",
          text: "Hero body copy over a dark backdrop.",
          spans: [],
        },
      ],
      background_image: heroImage,
      cta_label: "Explore",
      cta_link: { link_type: "Web", url: "https://example.com" },
    },
    items: [],
  } as unknown as Content.HeroSlice;
  const mediaTextFixture = {
    slice_type: "media_text",
    variation: "imageRight",
    primary: {
      heading: [{ type: "heading2", text: "MediaText slice", spans: [] }],
      body: [{ type: "paragraph", text: "Copy beside an image.", spans: [] }],
      media: heroImage,
    },
    items: [],
  } as unknown as Content.MediaTextSlice;
  const sectionGridFixture = {
    slice_type: "section_grid",
    variation: "default",
    primary: {
      heading: [{ type: "heading2", text: "SectionGrid slice", spans: [] }],
      columns: 3,
    },
    items: [
      {
        item_heading: [{ type: "heading3", text: "Card one", spans: [] }],
        item_body: [{ type: "paragraph", text: "Card body.", spans: [] }],
        item_media: heroImage,
        item_link: { link_type: "Web", url: "https://example.com" },
      },
    ],
  } as unknown as Content.SectionGridSlice;
  // Portfolio-intro twins. ComponentProps types the fixture to each slice's own
  // (inline) prop shape without needing generated Content.* types.
  const rtx = (text: string): RichTextField =>
    [{ type: "paragraph", text, spans: [] }] as unknown as RichTextField;

  const leadTextFixture: ComponentProps<typeof LeadText>["slice"] = {
    slice_type: "lead_text",
    variation: "default",
    primary: {
      eyebrow: "The Challenge",
      body: rtx("They needed an identity on a tight timeline to communicate that message."),
    },
  };
  // Eyebrow-less + duplicate/blank titles: locks the h2-promotion (no skip) and
  // index-key (no each_key_duplicate crash) behaviour under the axe gate.
  const textColumnsFixture: ComponentProps<typeof TextColumns>["slice"] = {
    slice_type: "text_columns",
    variation: "default",
    primary: {
      eyebrow: "",
      hasTopRule: false,
      desktopColumns: "3",
      columns: [
        { title: "Shared", body: rtx("First column.") },
        { title: "Shared", body: rtx("Duplicate title — index-keyed.") },
        { title: "", body: rtx("Blank title renders no heading.") },
      ],
    },
  };
  // figure/blockquote/figcaption with an avatar whose alt falls back to the
  // credited name — audits image-alt plus the "the name is not a heading"
  // outline decision (the label IS the section h2).
  const testimonialFixture = {
    slice_type: "testimonial",
    variation: "default",
    primary: {
      label: "What clients are saying",
      quote: "They shipped in six weeks what we had budgeted six months for.",
      name: "Dana Whitfield",
      role: "Director of Operations, Northgate",
      avatar: {
        url: pixel,
        alt: null,
        dimensions: { width: 400, height: 400 },
      },
    },
    items: [],
  } as unknown as Content.TestimonialSlice;
  // The dark ground is the contrast-sensitive one: white type + the inverted
  // outline button skin both get audited here.
  const ctaBannerFixture = {
    slice_type: "cta_banner",
    variation: "default",
    primary: {
      heading: [{ type: "heading2", text: "Ready to start your project?", spans: [] }],
      buttonLabel: "Talk with us",
      buttonLink: { link_type: "Web", url: "https://example.com" },
      background: "dark",
    },
    items: [],
  } as unknown as Content.CtaBannerSlice;
  const accordionFixture: ComponentProps<typeof AccordionSlice>["slice"] = {
    slice_type: "accordion",
    variation: "default",
    primary: {
      allowMultiple: true,
      items: [
        {
          title: "About the project",
          body: "A joint venture between two agencies.",
        },
        { title: "The team", body: "Design and strategy leads." },
      ],
    },
  };
</script>

<!-- A <div>, not a second <main>: the layout already renders the page's one
     main landmark (#main-content) around this. The template shipped a nested
     <main> here, which gives assistive tech two "main" regions to choose from. -->
<div class="max-w-3xl mx-auto px-8 py-16 space-y-12">
  <header class="space-y-2">
    <h1 class="text-3xl font-bold">Accessibility fixtures</h1>
    <p class="text-secondary">
      Used by the Playwright + axe-core CI gate. Every primitive on this page is expected to pass
      WCAG 2.2 AA.
    </p>
  </header>

  <section aria-labelledby="focus-trap-heading" class="space-y-4">
    <h2 id="focus-trap-heading" class="text-xl font-semibold">Focus trap</h2>
    <button
      type="button"
      onclick={() => (trapDemoOpen = true)}
      class="px-4 py-2 border-2 border-primary rounded bump"
    >
      Open focus-trap demo
    </button>
    {#if trapDemoOpen}
      <!-- In-flow stand-in for a custom (non-<dialog>) overlay, like Nav's
           mobile menu: exercises use:trapFocus + dialog semantics under axe
           without stacking a second fixed navbar and duplicate landmarks on
           top of the app Nav the root layout already mounts. -->
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Focus trap demo"
        class="border-2 border-primary rounded p-6 space-y-4"
        use:trapFocus={{ onEscape: () => (trapDemoOpen = false) }}
      >
        <p>Tab and Shift+Tab cycle within this region; Escape closes it.</p>
        <a href="#accordion-heading" class="block underline">Accordion</a>
        <a href="#form-heading" class="block underline">Form</a>
        <button
          type="button"
          onclick={() => (trapDemoOpen = false)}
          class="px-4 py-2 border-2 border-primary rounded bump"
        >
          Close demo
        </button>
      </div>
    {/if}
  </section>

  <section aria-labelledby="rich-text-heading" class="space-y-4">
    <h2 id="rich-text-heading" class="text-xl font-semibold">Rich text heading levels</h2>
    <RichTextBody field={richTextField} />
  </section>

  <section aria-labelledby="accordion-heading" class="space-y-4">
    <h2 id="accordion-heading" class="text-xl font-semibold">Accordion</h2>
    <Accordion {items} />
  </section>

  <section aria-labelledby="brand-icons-heading" class="space-y-4">
    <h2 id="brand-icons-heading" class="text-xl font-semibold">Brand icons</h2>
    <!-- BrandIcon is decorative (aria-hidden), so the accessible name must live
         on the wrapping link — exactly how sites are expected to use it. -->
    <ul class="flex flex-row gap-4">
      {#each ["facebook", "x", "reddit", "instagram", "linkedin"] as platform (platform)}
        <li>
          <a
            href="https://example.com/{platform}"
            aria-label="Reddoor on {platform}"
            class="block h-6 w-6 hover:opacity-75 transition-opacity"
          >
            <BrandIcon {platform} />
          </a>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="modal-heading" class="space-y-4">
    <h2 id="modal-heading" class="text-xl font-semibold">Modal</h2>
    <button
      type="button"
      onclick={() => (modalOpen = true)}
      class="px-4 py-2 border-2 border-primary rounded bump"
    >
      Open modal
    </button>
    <Modal bind:open={modalOpen}>
      <h3 class="text-lg font-semibold mb-2">Dialog title</h3>
      <p>Native dialog element with backdrop, ESC-to-close, and focus trap.</p>
    </Modal>
  </section>

  <section aria-labelledby="form-heading" class="space-y-4">
    <h2 id="form-heading" class="text-xl font-semibold">Form</h2>
    <Form method="POST" action="?/contact" class="space-y-4" errors={{}}>
      <Field
        name="email"
        label="Email"
        type="email"
        description="We use this only to reply."
        required
        bind:value={email}
      />
      <Field name="message" label="Message" type="textarea" required bind:value={message} />
      <button type="submit" class="px-4 py-2 bg-primary text-white rounded bump"> Send </button>
    </Form>
  </section>

  <section aria-labelledby="form-errors-heading" class="space-y-4">
    <h2 id="form-errors-heading" class="text-xl font-semibold">Form with errors</h2>
    <Form
      method="POST"
      class="space-y-4"
      errors={{
        email: "Email is required.",
        message: "Message must be at least 10 characters.",
      }}
    >
      <Field name="email" label="Email" type="email" required error="Email is required." />
      <Field
        name="message"
        label="Message"
        type="textarea"
        required
        error="Message must be at least 10 characters."
      />
      <button type="submit" class="px-4 py-2 bg-primary text-white rounded bump"> Send </button>
    </Form>
  </section>

  <section aria-labelledby="hero-image-heading" class="space-y-4">
    <h2 id="hero-image-heading" class="text-xl font-semibold">Hero background image</h2>
    <div class="relative h-40 overflow-hidden">
      <HeroBackgroundImage image={heroImage} altFallback="Placeholder hero" />
    </div>
  </section>

  <section aria-labelledby="img-heading" class="space-y-4">
    <h2 id="img-heading" class="text-xl font-semibold">Progressive image</h2>
    <Img src={runImport} alt="Placeholder progressive image" />
  </section>

  <section aria-labelledby="vimeo-banner-heading" class="space-y-4">
    <h2 id="vimeo-banner-heading" class="text-xl font-semibold">Vimeo banner</h2>
    <!-- No real video plays in CI: the iframe mounts only after genuine input,
         so axe sees the poster-only state. -->
    <VimeoBanner vimeoId="1" poster={runImport} alt="Placeholder banner reel" />
  </section>

  <section aria-labelledby="screen-width-media-heading" class="space-y-4">
    <h2 id="screen-width-media-heading" class="text-xl font-semibold">Screen-width media</h2>
    <!-- Poster-only (no vimeoId) so the fixture makes no external requests:
         the video iframe needs a live player.vimeo.com src, so its a11y
         attributes (tabindex="-1", aria-hidden) are asserted in
         ScreenWidthMedia.test.ts instead. -->
    <ScreenWidthMedia src={pixel} altText="Placeholder background" percentHeight={30} />
  </section>

  <section aria-labelledby="slider-heading" class="space-y-4">
    <h2 id="slider-heading" class="text-xl font-semibold">Slider</h2>
    <Slider itemCount={3} label="Example slides">
      {#snippet children({ index }: { index: number })}
        <div class="border-2 border-primary rounded p-6">
          <p>Slide body {index + 1}</p>
        </div>
      {/snippet}
    </Slider>
  </section>

  <section aria-labelledby="slider-autoplay-heading" class="space-y-4">
    <h2 id="slider-autoplay-heading" class="text-xl font-semibold">Slider (autoplay)</h2>
    <!-- Rotation is live during the axe run so the pause/play control and the
         muted live region are what get audited — the moving state is the one
         users hit. -->
    <Slider itemCount={3} label="Autoplaying slides" autoplay={5000}>
      {#snippet children({ index }: { index: number })}
        <div class="border-2 border-primary rounded p-6">
          <p>Autoplay slide body {index + 1}</p>
        </div>
      {/snippet}
    </Slider>
  </section>

  <section aria-labelledby="carousel-heading" class="space-y-4">
    <h2 id="carousel-heading" class="text-xl font-semibold">Carousel primitive</h2>
    <!-- The headless carousel ($lib/carousel.svelte.ts) with CarouselArrows and
         CarouselProgress, as the homepage's featured-properties band will wear
         it: garnet controls on the sand card, the comp's 4s dwell and 0.5s
         dissolve. The axe run is under reduced motion, so it audits the state
         with NO pause control and the bar drawing position; the rotating state
         is covered by carousel.svelte.test.ts and tests/interaction/carousel.spec.ts. -->
    <CarouselFixture label="Autoplaying carousel" autoplay={4000} settle={500} />
    <!-- And as issue #14's featured card will: cream controls on garnet, no
         autoplay, so the bar is a position indicator. -->
    <CarouselFixture label="Manual carousel" tone="cream" />
  </section>

  <section aria-labelledby="countup-heading" class="space-y-4">
    <h2 id="countup-heading" class="text-xl font-semibold">Count up</h2>
    <!-- The animating digits live in an aria-hidden layer; a visually-hidden
         sibling carries the final value for assistive tech, so axe audits the
         two-layer structure. -->
    <p class="text-3xl font-bold">
      <CountUp value={1284} suffix="+" /> projects delivered
    </p>
  </section>

  <!-- Prismic slices — each renders its own <section> + heading; axe
       audits the produced markup (contrast, alt text, heading order). -->
  <Hero slice={heroSliceFixture} />
  <MediaText slice={mediaTextFixture} />
  <SectionGrid slice={sectionGridFixture} />
  <LeadText slice={leadTextFixture} />
  <TextColumns slice={textColumnsFixture} />
  <AccordionSlice slice={accordionFixture} />
  <Testimonial slice={testimonialFixture} />
  <CtaBanner slice={ctaBannerFixture} />

  <!-- The property page's body. It renders its own <h1> (it is the page on
       /properties/<uid>), so this page carries two; axe has no rule against
       that, and the gate is here for the component's contrast, names and
       table semantics. Under Contract + the fixture's NEW flag render both
       garnet badges; Sold uses the same markup. -->
  <PropertyDetail property={propertyFixture({ status: "Under Contract" })} />

  <!-- The listing page: its masthead in BOTH states (two more h1s on this page,
       see above) and every card variant — garnet featured with the cream
       button, flat with the garnet button, Under Contract + New badges on both
       grounds, and the unlinked Sold grid on sand.

       The photo state first, on a drawn near-white ground (#15). axe cannot
       measure text over an image — it files colour-contrast as `incomplete`,
       "needs review" — so what this gate actually covers here is the alt text,
       the heading and the aria-hidden scrim layers; the ratio itself is
       computed from the scrim's own stops in PageMasthead.test.ts. Neither
       instance preloads: the hero fixture above already injects the page's one
       fetchpriority=high link, and a second would fight it for bandwidth. -->
  <PageMasthead title="Our Properties" image={PROPERTIES_MASTHEAD_FIXTURE} preload={false} />
  <PageMasthead title="Our Properties, no photo" preload={false} />
  <PropertyListing sections={groupListings(propertyListingFixture())} />

  <!-- The top of the homepage (one more h1 on this page, see above): the sand
       headline, dust list and cream buttons on the garnet band. Poster-less,
       which is the launch state — and the hero carries no text, so a poster
       would add nothing for axe to measure. The band's ground is a gradient,
       which axe reports as "needs review" rather than measuring; the pairs on
       it are held by theme-contrast.test.ts at both ends (garnet and dark).
       Full width, and the pin, are /dev/home's. -->
  <HomeHero slice={homeHeroFixture()} />

  <!-- The homepage's featured band, twice: the comp's three listings (a
       carousel — garnet arrows and bar on the sand card) and launch day's ONE
       (a plain card: no region, no arrows, no bar — under its own heading,
       because two landmarks may not share a name on one page). This gate runs
       under reduced motion, so the Pause control is never in what axe sees
       here; its name and its place in the tab order are held by
       FeaturedProperties.test.ts and tests/interaction/featured-properties.spec.ts.
       Rotation and the full width are /dev/home's.

       WHAT AXE DOES NOT MEASURE HERE — nothing, now, and that is new. Until
       2026-09-21 an off-stage slide sat over the card at opacity 0 carrying an
       OPAQUE photo box (`bg-background`), and axe answered `color-contrast`
       for everything under it with "needs review" (`bgOverlap`) rather than a
       ratio. The comment this replaces said that cost "the eyebrow's
       contrast"; it cost nearly all of the card's text — measured 1 node
       passed / 6 incomplete on the three-listing band at 1440, and 1 / 9 on
       the launch one, whose blind spot was in fact the portfolio button's
       inset-0 overlay (since removed) and not the subgrids at all. The slice
       now takes an off-stage slide out of the paint with `invisible`, delayed
       by the dissolve. Measured on this page after the change: 15 nodes
       measured across the two bands, 0 incomplete, 0 violations. The
       CarouselFixture stacks above never had it (3 passed / 0 incomplete
       each) — their slides carry no opaque background. -->

  <FeaturedProperties slice={featuredPropertiesFixture()} />
  <FeaturedProperties slice={featuredLaunchFixture({ heading: "Featured Property" })} />

  <!-- The homepage's "Our Legacy" band in its FULLEST state, not its launch
       one: a headshot on both cards and a bio on the first, so axe sees the
       <details>/<summary> PROFILE, both 24px link targets and the photo's empty
       alt beside a partner with neither. The bio is closed here, as it is on
       arrival; tests/interaction/partners.spec.ts audits it open, and requires
       that axe MEASURED every text node rather than leaving the 12px links as
       "needs review". -->
  <Partners slice={partnersFixtureState({ bio: true, photos: true })} />

  <!-- The homepage's photo band, FILLED — a drawing with an alt, so axe has an
       image to hold to `image-alt`; empty (the launch state) it is a gradient
       with nothing in it to audit. It never pins here: the pin is gated on
       being the last thing in <main>, and this is inside the page's wrapper.
       The pin is /dev/home's, and tests/interaction/photo-band.spec.ts's. -->
  <PhotoBand slice={photoBandFixture({ image: HOME_PHOTO_FIXTURE as never })} />
</div>

<!-- Renders nothing at rest (overlay only appears mid-navigation, aria-hidden);
     mounted so the axe gate covers its resting state. -->
