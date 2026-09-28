<script lang="ts">
  // The top of the homepage — the comp's wrapper `Frame 202` (6815:55 at 1440,
  // 6994:797 at 390), which is THREE layers in one box, bottom to top:
  //
  //   Masthead #1   6802:1417 / 6994:798   the hero: 528 tall at every width,
  //                                        STICKY_SCROLLS, fill #3d0707, and no
  //                                        text — its one text node is hidden
  //                                        wireframe residue
  //   Frame 194     6802:1423 / 6994:803   the RI cutout: a garnet square with
  //                                        the letterforms knocked out, 451² at
  //                                        1440 and 195² (half the band) at 390, its
  //                                        bottom edge ON the band's top
  //   Value Prop #1 6802:1425 / 6994:805   the garnet band: H1, a one-sentence
  //                                        subheading and two buttons
  //
  // THE BAND IS 'Homepage - REVISED' 7091:640 (2026-09-26), not 6802:1425. The
  // client asked for the headline full width with the left-hand column gone,
  // and one sentence under it "before the buttons"; Nicole drew that at 1440
  // only. One column, padding 80/80 with 30 between headline, subheading and
  // buttons. The "Our specialty" list the old band carried in its left column
  // is gone from the comp, and from the model with it: the phrases survive in
  // the page's meta description, not in its body. The revision has no 390 or
  // 1280 frame, so its rhythm is applied at every width (operator call D5).
  //
  // ONE slice, not two, because of how the comp moves: only the hero is sticky,
  // and `position: sticky` is bounded by its PARENT. Sharing a <section> with
  // the band gives the hero exactly the band's height to stay pinned for (478px
  // at 1440, 644 at 390) while the band — and the cutout riding on it — slides
  // up over it. As sibling slices in <main> the hero would pin for the whole
  // page and every later band would need an opaque ground forever.
  //
  // Three things here are load-bearing and look like tidying targets:
  //
  // - NO `overflow-hidden` on the section. The 390 wrapper has clipsContent, and
  //   transcribing that makes the section the hero's scrollport: the pin dies
  //   silently. (The hero clips its OWN media; that is fine.)
  // - The cutout lives in the BAND (`bottom-full`), never in the hero. Inside the
  //   sticky box it sits in the right place at rest and stays behind when the
  //   band moves. tests/interaction/home-hero.spec.ts holds both.
  // - The band's gradient HOLDS garnet for its top half (`from-50%`, the comp's
  //   stops #652323 @ 0.5 → #3d0707 @ 1). PageMasthead and the menu use the same
  //   two tokens with no hold; here the hold is what makes the cutout's square
  //   and the band read as one shape. For the same reason the hero's ground is
  //   FLAT dark: on the brand gradient the upper half of the mark would be
  //   garnet on garnet.
  //
  // The comp's hero photo is a watermarked iStock preview still (#3) and is not
  // in this repo. `poster` is the field a licensed one goes in; empty, the hero
  // is the dark ground with the cutout over it — which is the launch state.
  //
  // `vimeo_id` was MODELLED in the hero batch and deliberately not rendered, so
  // the editor's document would not change shape when the player landed. It
  // renders now (#29): HeroBackgroundVideo is a LAYER over whatever ground this
  // band already has. It draws nothing at all without an id, and reveals
  // nothing until playback progress is actually arriving — so a blocked player,
  // a wrong id and `prefers-reduced-motion: reduce` all leave this hero exactly
  // as it is without one. It is a second rendering of
  // $lib/utils/vimeoBackground.svelte, which is VimeoBanner's own gate and
  // heartbeat lifted out; neither VimeoBanner's box nor ScreenWidthMedia's fits
  // a 528px sticky pin.
  //
  // With no `slice` at all this still renders the dark 528px ground. The home
  // route depends on that: it claims `navOver: "dark"` as a literal, before it
  // has read the document (see $lib/home-page).
  import { asText, isFilled, type Content } from "@prismicio/client";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import HeroBackgroundImage from "$lib/components/HeroBackgroundImage.svelte";
  import HeroBackgroundVideo from "$lib/components/HeroBackgroundVideo.svelte";
  import { cmsHref } from "$lib/cms-href";
  import { linkResolver } from "$lib/prismicio";

  let { slice }: { slice?: Content.HomeHeroSlice } = $props();

  // The site's gutters. The revised band does NOT use the site's two-column
  // grid (`[397fr_847fr]`, right column at x=513): its text stands on the
  // gutter itself, x=80 at 1440, 1280 wide.
  const GUTTERS = "mx-auto max-w-[1440px] px-5 sm:px-8 xl:px-20";

  const primary = $derived(slice?.primary);

  // Shift+Enter in the editor is "\n" in the text; the comp has U+2028 there.
  // The H1 is authored here rather than by PrismicRichText so it can carry the
  // ramp's classes — and the break is the only markup the field may hold.
  const lines = $derived(
    asText(primary?.heading ?? [])
      .split(/[\n\u2028]/)
      .map((line) => line.trim())
      .filter(Boolean),
  );

  // Every line but the last keeps a trailing space — see the H1's note.
  const spoken = $derived(lines.map((line, i) => (i < lines.length - 1 ? `${line} ` : line)));

  const poster = $derived(primary && isFilled.image(primary.poster) ? primary.poster : undefined);

  // A button needs a label AND somewhere to go; the first two that have both.
  // A new tab only when the editor asked for one.
  const buttons = $derived(
    (primary?.buttons ?? [])
      .flatMap((button) => {
        const text = button.label?.trim() ?? "";
        const href = cmsHref(button.link, { linkResolver });
        if (text === "" || href === null) return [];
        const blank = "target" in button.link && button.link.target === "_blank";
        return [{ text, href, blank }];
      })
      .slice(0, 2),
  );

  // One sentence, plain text. A blank one draws no empty <p> and no gap.
  const subheading = $derived(primary?.subheading?.trim() ?? "");
</script>

<section
  data-slice-type="home_hero"
  data-slice-variation={slice?.variation ?? "default"}
  class="relative isolate bg-dark"
>
  <!-- Masthead #1. `preload`: this is the page's one LCP image. The crop is the
       comp's — 230 of the photo's 337px vertical overflow sits above the band
       (68.2%); at 390 a 16:9 source covers by height, so the same value is a
       no-op there. The comp's extra 1.068× zoom past cover is not reproduced. -->
  <!-- The pin is `motion-safe:` — ruled once for the page (#38). A full-bleed
       band held still while the page slides over it is parallax at rate zero,
       which is what `prefers-reduced-motion: reduce` asks a site to drop, and
       the photo band at the foot of this page already drops its pin there. Two
       opposite rulings 1000px apart was the one wrong answer. Under `reduce`
       the hero is `relative` (it still needs a position for `z-0`) and leaves
       with the page; the cutout rides on the BAND, so it is right either way. -->
  <div
    data-home-hero-pin
    class="relative z-0 h-[528px] overflow-hidden bg-dark motion-safe:sticky motion-safe:top-0"
  >
    {#if poster}
      <HeroBackgroundImage
        image={poster}
        class="absolute inset-0 h-full w-full object-cover object-[50%_68.2%]"
      />
    {/if}
    <!-- Over the poster (or the bare ground), inside the pin's own
         `overflow-hidden` so the 939px cover floor crops at the sides on a
         phone rather than widening the page. `bandHeight` is this div's
         `h-[528px]`, passed rather than measured — one number, in one place,
         and no layout read on the page's LCP band. -->
    <HeroBackgroundVideo vimeoId={primary?.vimeo_id} label="hero film" bandHeight={528} />
  </div>

  {#if slice}
    <!-- Value Prop #1. `data-nav-gate`: the homepage bar's wordmark stays hidden
         until THIS element's top reaches the bar's bottom (#18) — measured as
         rect against rect, never as a scrollY. -->
    <div data-nav-gate class="relative z-10 bg-gradient-to-b from-primary from-50% to-dark">
      <!-- Frame 194, as exported from 6802:1423 — the path is that export's
           bytes (its instance 6802:1424 exports byte-identically), not a
           redraw; HomeHero.test.ts pins its hash. `fill-primary` is the band's
           own `from-primary`, so square and band cannot drift apart.

           The export clips the path to its 451 box; the path itself overruns it
           by 1.13px at the bottom. The clip here keeps the other three sides
           and lets the bottom lap 2px INTO the band — garnet on garnet — so no
           hairline of the hero shows between the two at a fractional scroll
           position or device-pixel ratio.

           Half the BAND, capped at the comp's 451 — not `50vw`. On a phone the
           two are the same 195; wherever the scrollbar takes layout width
           (app.css's `scrollbar-gutter: stable` — 15px on CI and in headless
           Chromium here) `vw` still counts the gutter, and the square came out
           7.5px wider than half of what it sits on. -->
      <svg
        data-home-hero-cutout
        viewBox="0 0 451 451"
        aria-hidden="true"
        focusable="false"
        class="absolute bottom-full left-0 aspect-square w-1/2 max-w-[451px] overflow-visible
          fill-primary [clip-path:inset(0_0_-2px_0)]"
      >
        <path
          d="M88.6131 126.021H-0.316895V242.866H90.3695C133.967 242.866 158.954 219.614 158.954 185.322V184.151C158.954 145.781 132.21 126.021 88.6131 126.021ZM-0.316895 -0.212334V45.225H96.1825C147.914 45.225 188.019 59.7574 214.763 86.5012C237.429 109.168 249.641 141.139 249.641 179.509V180.68C249.641 246.358 214.177 287.634 162.446 306.808L261.852 452.132H307.938V270.07H389.068V452.132H451.338V-0.212334H-0.316895ZM389.047 221.621H307.917V140.491H389.047V221.621ZM-0.316895 321.926V452.132H157.219L70.0242 321.926H-0.316895Z"
        />
      </svg>

      <!-- Padding 40/20/60/20 at 390 and 80/80/65/80 at 1440. The revised
           comp declares 120 at the foot, but its wrapper `Frame 202` is a
           typed 920 that the band's hug overruns, and the next band paints
           over the difference: 65 under the buttons is what it SHOWS (render,
           855 → 920). The same rule gave the old band's 115 against its 120. -->
      <div class="{GUTTERS} pt-10 pb-[60px] lg:pt-20 lg:pb-[65px]">
        <!-- 30 between the three, as drawn (7091:650, vertical, gap 30). The
             ramp's negative margins make the H1 occupy its cap box, so the gap
             runs cap-box to subheading like Figma's: 124 + 30 + 24 + 30 at 1440. -->
        <div class="flex flex-col items-start gap-[30px]">
          {#if lines.length > 0}
            <!-- 390's 42/52.5 headline carries no style id and is not in the
                 ramp; it renders in H2, the call PageMasthead already made.
                 The space kept before each <br> is for everything that reads
                 the TEXT — a search snippet, a copy — where a bare <br> welds
                 "CommercialReal"; at a line's end it paints nothing. -->
            <!-- The editor's soft break applies from `lg`. The revised comp
                 breaks after "Commercial" (U+2028 in 7091:651), and that break
                 is FORCED there, not a wrap: in its 1280 box the words would
                 wrap as "…Commercial Real Estate / Experts Since 1983."
                 ("San Antonio's Commercial Real Estate" is 1141 at 66px). The
                 longer line is the second, "Real Estate Experts Since 1983.",
                 measured in Chromium on the served face — see
                 tests/interaction/home-hero.spec.ts, which holds two lines at
                 the narrowest `lg` layout, 1024 − 15 scrollbar − 64 gutters =
                 945. Below `lg` the text is H2 and flows; the 390 comp has no
                 break either. -->
            <h1 class="t-h2 text-light lg:t-h1">
              {#each spoken as line, i (i)}{#if i > 0}<br
                    class="hidden lg:inline"
                  />{/if}{line}{/each}
            </h1>
          {/if}
          {#if subheading}
            <!-- Body 1 (style 2763:58107, 400 16/24, untrimmed), the headline's
                 own off-white: 7091:903. The client's note said "the size of
                 consulting and brokerage", which was H5 caps in dust; the comp
                 Nicole drew answers it with Body 1, and the comp is the call
                 (operator D2). -->
            <p class="t-body-1 text-light">{subheading}</p>
          {/if}
          {#if buttons.length > 0}
            <!-- The comp's `button light` with a pure-white override. "cream"
                 is 5% of luminance off that and keeps the fill-on-hover every
                 other button has; the comp's own hover here is the component's
                 variants wired backwards. 20 apart in the revision (7091:652),
                 where the old band had 40. CMS order: PROPERTIES first, then
                 CONTACT US, is the content's job (the seed and the fixture). -->
            <div class="flex flex-wrap gap-5">
              {#each buttons as button, i (i)}
                <BrandButton
                  href={button.href}
                  tone="cream"
                  target={button.blank ? "_blank" : undefined}
                  rel={button.blank ? "noopener noreferrer" : undefined}
                >
                  {button.text}
                </BrandButton>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</section>
