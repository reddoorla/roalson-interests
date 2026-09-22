<script lang="ts">
  // The comp's `Masthead #1` as the Properties page wears it (6991:978 at
  // 1440, 6992:2865 at 390): a 400px band — 240 on mobile — with the page's
  // H1 sitting on the listing column's left edge, its baseline 72px above the
  // band's bottom (44 on mobile, centred).
  //
  // THE PHOTO. The comp fills the band with a skyline photo; until #15 the
  // band was the brand's garnet-to-dark gradient, because that file was
  // unlicensed Unsplash stock (#3) and no CMS field carried a masthead image.
  // Both now exist: the operator authorised placeholder photography, and the
  // image comes from the `page_media` singleton (see $lib/page-media-load) —
  // from the CMS and never from `static/`, precisely because it is a
  // placeholder the client replaces. With no image, an empty image field, or
  // no `page_media` document at all, this renders EXACTLY the band above:
  // `image` adds elements, it never changes the ones already here.
  //
  // CONTRAST, WHICH IS THE WHOLE DESIGN. The H1 is white and the comp's
  // overlay is a 0→20% black gradient. Over this photograph — the San Antonio
  // skyline at sunrise — the worst pixel under the H1 gives white 1.02:1 at
  // 1440 and 1.04:1 at 390. Naked, it is illegible, and no overlay drawn to
  // taste can be trusted to fix that for the NEXT photo an editor uploads. So
  // both layers below are sized against a pure-white photo pixel, the worst
  // case any photograph can present. Their stops are in app.css beside the
  // palette (measured values live there), and PageMasthead.test.ts parses them
  // back out and recomputes the ratio rather than trusting this comment:
  //
  //   `.masthead-scrim`  the band's own gradient. The H1's line box runs
  //                      66.5%→86.5% of the band at BOTH breakpoints (44px of
  //                      80px line-height above a 72px pad in 400; 25 of 48
  //                      above 44 in 240 — the same two numbers), so the scrim
  //                      is >= 0.60 black from 66% down. White then clears
  //                      5.74:1 on pure white, and measures 6.20:1 / 6.84:1 on
  //                      the real photo. WCAG 1.4.3 asks 3:1 of this text
  //                      (66px and 38px are both large text); it gets AA for
  //                      normal text with room to spare.
  //
  //   `.masthead-shade`  the bar's. The nav floats over this band in its
  //                      reverse tone (`navOver: "dark"`), and its CONTACT US
  //                      label is `t-h6` — 12px, so SMALL text needing 4.5:1 —
  //                      in dust. Dust is a MID tone (L 0.415): a half-hearted
  //                      scrim moves a bright sky TOWARD it and makes things
  //                      worse, not better. Measured, 0.30 black took dust
  //                      from 2.19:1 to 1.04:1. The choice is therefore binary
  //                      — dark enough or not at all — and this is dark
  //                      enough: 0.78 through the bar's height puts dust at
  //                      5.12:1 on pure white, 5.19:1 on the photo. That is
  //                      the /properties half of #45; the homepage's stays
  //                      open, and a third bar tone would buy the picture back.
  import type { ImageField } from "@prismicio/client";
  import HeroBackgroundImage from "$lib/components/HeroBackgroundImage.svelte";

  interface Props {
    title: string;
    /** The band's photograph. Absent or empty: the brand gradient, untouched. */
    image?: ImageField | null;
    /**
     * Inject the LCP `<link rel=preload>` for the photo. True on a real page —
     * the masthead IS the LCP there — and false wherever a second hero-ish
     * image already preloads on the same page (see HeroBackgroundImage).
     */
    preload?: boolean;
    class?: string;
  }

  let { title, image = null, preload = true, class: passedClasses = "" }: Props = $props();

  const hasPhoto = $derived(Boolean(image?.url));
</script>

<!-- The band's classes stay SPELLED OUT on this tag, not assembled in the
     script. src/routes/nav-over.test.ts reads the first opening tag of this
     file looking for the literal `from-primary` — the gradient's first stop is
     what `canvasTop` mirrors above the document — and a `class={…}` binding
     hides it. That is exactly how it was caught: the binding read better and
     failed a test that had landed on main meanwhile.

     `relative` is the ONLY class the photo adds, and only with a photo:
     absolutely-positioned layers paint above static ones, so without it the
     scrim would cover the H1 — and with no photo the list has to stay what it
     was before the photo existed. PageMasthead.test.ts pins that. -->
<header
  class="flex h-60 items-end bg-gradient-to-b from-primary to-dark px-5 pb-11 sm:px-8 lg:h-[400px]
    lg:pb-[72px] xl:px-20 {hasPhoto ? 'relative ' : ''}{passedClasses}"
>
  {#if hasPhoto}
    <HeroBackgroundImage image={image as ImageField} {preload} />
    <!-- Decorative, and named here rather than in the CSS: both layers are
         `aria-hidden` boxes that exist only to darken pixels. The shade's box is
         tall enough that the floating bar sits in its darkest 45%: 80/176 and
         70/154 are both 45.45%, so the bar lands on the same alpha at both
         breakpoints. -->
    <div
      class="masthead-shade absolute inset-x-0 top-0 h-[154px] lg:h-[176px]"
      aria-hidden="true"
    ></div>
    <div class="masthead-scrim absolute inset-0" aria-hidden="true"></div>
  {/if}
  <div
    class="{hasPhoto ? 'relative ' : ''}mx-auto w-full max-w-[1280px] lg:grid
      lg:grid-cols-[397fr_847fr] lg:gap-9"
  >
    <h1 class="t-h2 lg:t-h1 text-center text-white lg:col-start-2 lg:text-left">{title}</h1>
  </div>
</header>
