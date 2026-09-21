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
  //   Value Prop #1 6802:1425 / 6994:805   the garnet band: H1, two buttons and
  //                                        the "our specialty" list
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
  // `vimeo_id` is MODELLED so the editor's document does not change shape when
  // the player lands, and deliberately not rendered: the video layer is its own
  // batch (lift VimeoBanner's interaction gate and heartbeat, not its markup).
  //
  // With no `slice` at all this still renders the dark 528px ground. The home
  // route depends on that: it claims `navOver: "dark"` as a literal, before it
  // has read the document (see $lib/home-page).
  import { asText, isFilled, type Content } from "@prismicio/client";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import HeroBackgroundImage from "$lib/components/HeroBackgroundImage.svelte";
  import { cmsHref } from "$lib/cms-href";
  import { linkResolver } from "$lib/prismicio";

  let { slice }: { slice?: Content.HomeHeroSlice } = $props();

  const uid = $props.id();

  // The site's gutters and its ONE two-column grid: the right column starts at
  // x=513 on every band of every page. This band is drawn 374 | 60 | 846
  // (text at x=514) — the comp is 1px inconsistent between its own bands — so
  // the grid stays the site's and the LEFT column's content is capped instead.
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

  const label = $derived(primary?.specialty_label?.trim() ?? "");
  const specialties = $derived(
    (primary?.specialties ?? []).map((item) => item.text?.trim() ?? "").filter(Boolean),
  );
  const hasList = $derived(label !== "" || specialties.length > 0);
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
  <div data-home-hero-pin class="sticky top-0 z-0 h-[528px] overflow-hidden bg-dark">
    {#if poster}
      <HeroBackgroundImage
        image={poster}
        class="absolute inset-0 h-full w-full object-cover object-[50%_68.2%]"
      />
    {/if}
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

      <!-- Padding 40/20/60/20 at 390 and 80/80/120/80 at 1440 — where the comp's
           wrapper is a typed 1006 that its hugging band overruns by 5px, the
           next band painting over the difference. 115 is the visible result. -->
      <div class="{GUTTERS} pt-10 pb-[60px] lg:pt-20 lg:pb-[115px]">
        <!-- DOM order is the 390 comp's and the reading order: headline and
             buttons, then the list. From `lg` the list takes the left column
             by placement; it holds nothing focusable, so focus order is the
             same either way. -->
        <div class="flex flex-col gap-[60px] lg:grid lg:grid-cols-[397fr_847fr] lg:gap-9">
          <div class="flex flex-col items-start gap-10 lg:col-start-2 lg:row-start-1">
            {#if lines.length > 0}
              <!-- 390's 42/52.5 headline carries no style id and is not in the
                   ramp; it renders in H2, the call PageMasthead already made.
                   The space kept before each <br> is for everything that reads
                   the TEXT — a search snippet, a copy — where a bare <br> welds
                   "Experts.Since"; at a line's end it paints nothing. -->
              <!-- The editor's soft break applies only where the comp's first
                   line FITS. "San Antonio's Commercial" is 779px at 66px and
                   the right column is (W − 196) × 847/1244, so it needs a
                   layout of 1340 — and the layout is 15px narrower than the
                   viewport wherever a scrollbar takes space, hence 1366 (which
                   is also the commonest laptop width). Below that the break is
                   `display: none` and the text flows: three lines at 1280
                   ("San Antonio's / Commercial Real Estate / Experts. Since
                   1983.") where the forced break made four, with "Experts."
                   alone on a line and the band 76px taller than the comp. At
                   390 the comp has no break either. -->
              <h1 class="t-h2 text-light lg:t-h1">
                {#each lines as line, i (i)}{#if i > 0}<br
                      class="hidden min-[1366px]:inline"
                    />{/if}{i < lines.length - 1 ? `${line} ` : line}{/each}
              </h1>
            {/if}
            {#if buttons.length > 0}
              <!-- The comp's `button light` with a pure-white override. "cream"
                   is 5% of luminance off that and keeps the fill-on-hover every
                   other button has; the comp's own hover here is the component's
                   variants wired backwards. -->
              <div class="flex flex-wrap gap-x-10 gap-y-5">
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

          {#if hasList}
            <!-- Every child of the comp's list is 30 from the next: label, rule,
                 item, rule, item… The ramp class sits on an inner element so
                 its cap-height trim is taken from the TEXT and not from outside
                 the rule.

                 The rule is the comp's 0.5px dust stroke (6806:50), and it is
                 NOT a border: Chromium snaps `border-top-width: 0.5px` up to a
                 whole CSS pixel — measured here at 1× AND at an emulated 2×,
                 where it painted two solid device rows, double the comp's
                 weight. A 1px box scaled to half paints what Figma paints: one
                 crisp device row at 2×, one row at half strength at 1×. Out of
                 flow, like the comp's zero-height line, so the 30s stay 30. -->
            <div class="lg:col-start-1 lg:row-start-1 lg:max-w-[374px]">
              {#if label}
                <h2 id="{uid}-specialty" class="t-h5 text-light">{label}</h2>
              {/if}
              {#if specialties.length > 0}
                <ul
                  aria-labelledby={label ? `${uid}-specialty` : undefined}
                  class="flex flex-col gap-[30px] {label ? 'mt-[30px]' : ''}"
                >
                  <!-- Index-keyed: two specialties may read the same. -->
                  {#each specialties as specialty, i (i)}
                    <li
                      data-home-hero-rule
                      class="relative pt-[30px] before:absolute before:inset-x-0 before:top-0
                        before:h-px before:origin-top before:scale-y-50 before:bg-dust"
                    >
                      <span class="t-h5 block text-dust">{specialty}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</section>
