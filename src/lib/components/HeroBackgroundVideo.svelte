<script lang="ts">
  // The homepage hero's moving layer — the half HeroBackgroundImage paints
  // still. It is a LAYER and never a band: it has no box of its own, fills
  // whatever positioned parent it is dropped into, and renders literally
  // nothing without a usable id.
  //
  // WITH NO ID, NO NETWORK, A FAILED EMBED OR `prefers-reduced-motion: reduce`,
  // the hero it sits in is the hero that shipped before it — the flat #3d0707
  // ground, or the poster if one is filled (operator call 11: the video is a
  // layer OVER that ground, never a replacement for it). Every one of those
  // four states is the same code path: nothing is revealed until playback
  // progress is actually arriving, so "no evidence of motion" and "no video"
  // render identically by construction rather than by a fallback branch.
  //
  // WHY NOT VimeoBanner OR ScreenWidthMedia WHOLE. Both already do the gate and
  // the heartbeat, and in both the MARKUP is the whole of the rest: VimeoBanner
  // is a `w-screen aspect-video` <section> with its own `?as=run` poster
  // underneath, ScreenWidthMedia an `lvh`-tall backdrop driven by a viewport
  // store and the player.js SDK. This hero is a 528px band with a Prismic
  // poster cropped to `object-position: 50% 68.2%`, inside a `sticky` pin whose
  // height and stacking context are load-bearing (#38 the pin, #45 the bar that
  // floats over it). Neither component can be dropped in. So their shared
  // BEHAVIOUR was lifted to $lib/utils/vimeoBackground.svelte and this file is a
  // second rendering of that one controller — not a third hand-rolled embed.
  //
  // COVER, IN CSS ONLY. A 16:9 embed covering a band `bandHeight` tall must be
  // at least `bandHeight × 16/9` wide; wider than that and 100% of the band
  // wins. `max()` of the two, centred on both axes, is the whole of it — no
  // viewport store, no resize listener, no layout read. At the hero's 528 that
  // floor is 939px (528 × 16/9 = 938.67, rounded UP so the height can never
  // land a fraction short and show a hairline of ground).
  //
  // WCAG 2.2.2. See the control's own comment below.
  import { ARROW_SHAPE, ARROW_TONES } from "$lib/components/CarouselArrows.svelte";
  import PlayPauseGlyph from "$lib/components/PlayPauseGlyph.svelte";
  import { parseVimeoId } from "$lib/utils/vimeo";
  import { backgroundEmbedSrc, VimeoBackground } from "$lib/utils/vimeoBackground.svelte";

  interface Props {
    /** The CMS `vimeo_id` text field, exactly as the editor filled it in. */
    vimeoId?: string | null;
    /** Height of the band being covered, px. The cover floor derives from it. */
    bandHeight?: number;
    /** Names the clip: "Pause the {label}" / "Play the {label}". */
    label?: string;
  }

  let { vimeoId = null, bandHeight = 528, label = "background video" }: Props = $props();

  // Parsed, never trusted: `vimeo_id` is free text interpolated into an iframe
  // `src`. `parseVimeoId` returns digits or null, so an editor's pasted URL
  // still works and anything unparseable renders no player at all.
  const id = $derived(parseVimeoId(vimeoId));
  const src = $derived(id ? backgroundEmbedSrc(id) : "");
  const coverWidth = $derived(Math.ceil((bandHeight * 16) / 9));

  const video = new VimeoBackground();

  let frameEl: HTMLDivElement | undefined = $state();
  let iframeEl: HTMLIFrameElement | undefined = $state();

  // Two effects, each owning one teardown. The gate watches this layer's own
  // box; the heartbeat can only start once the iframe it listens for exists.
  $effect(() => {
    const el = frameEl;
    if (!el) return;
    return video.gate(el);
  });

  $effect(() => {
    const el = iframeEl;
    if (!el) return;
    return video.watch(el);
  });
</script>

{#if src}
  <!-- `data-hero-video` is the layer made visible to a browser test: present
       means the component chose to render, which is what separates "reduced
       motion declined the iframe" from "no id was configured at all".
       `pointer-events-none`: the chrome-less embed has no controls to operate,
       but Vimeo's own overlay would still swallow a click aimed at the hero. -->
  <div
    bind:this={frameEl}
    data-hero-video
    data-hero-video-playing={video.visible ? "" : undefined}
    class="pointer-events-none absolute inset-0 overflow-hidden"
  >
    {#if video.mounted}
      <!-- Decorative. The clip carries nothing the page does not already say in
           text, and `tabindex="-1"` + `aria-hidden` keep keyboard and AT users
           out of an iframe with nothing inside it to reach. The pause control
           below — outside this subtree — is the accessible surface.
           The fade IS the reveal: what shows until playback is genuinely
           progressing, and again the moment it stops or the visitor presses
           Pause, is the frame underneath. -->
      <iframe
        bind:this={iframeEl}
        title={label}
        {src}
        style="width: max(100%, {coverWidth}px)"
        class="absolute top-1/2 left-1/2 aspect-video -translate-x-1/2 -translate-y-1/2 border-0
          transition-opacity duration-700 {video.visible ? 'opacity-100' : 'opacity-0'}"
        allow="autoplay; fullscreen"
        tabindex="-1"
        aria-hidden="true"
      ></iframe>
    {/if}
  </div>

  <!-- THE CONTROL'S SEAT, and it is a wrapper for two reasons.
       The first is a defect this cost, measured in Chromium on 2026-09-21: the
       placement classes were on the BUTTON, after `ARROW_SHAPE` in the class
       string — and `ARROW_SHAPE` opens with `relative`, which a carousel arrow
       needs to seat its `before:` hit area in a flex row. A class attribute's
       order does not decide Tailwind's cascade; the stylesheet's does, and it
       emits `relative` after `absolute`. So `relative` won, `bottom-5 right-5`
       became offsets from a static position, and the control rendered at
       (-80, -20) — off the page, still focusable, and invisible in every jsdom
       test because jsdom resolves no stylesheets. A wrapper keeps the shared
       ring string exactly what the carousel needs and puts the positioning
       where nothing competes with it.
       The second is that it lets a browser assert the placement with no player
       in the loop: the seat ships whenever the layer does, so
       tests/interaction/home-hero-video.spec.ts can measure this corner
       without a third party on the critical path.
       Bottom-RIGHT on the band's own gutter scale: the RI cutout occupies
       bottom-left and the floating bar the top. Outside the layer above, so it
       is neither `aria-hidden` nor pointer-events-none, and later in the DOM so
       it paints over the video. -->
  <div data-hero-video-controls class="absolute right-5 bottom-5 z-10 flex sm:right-8 xl:right-20">
    {#if video.controllable}
      <!-- WCAG 2.2.2 Pause, Stop, Hide. The clip is 8 seconds and LOOPS
           (measured against Vimeo's player config, 2026-09-21), so it is moving
           content that starts automatically, lasts more than five seconds and is
           presented in parallel with the headline band — all three conditions,
           so a mechanism is required, not optional. `?background=1` draws no
           controls of its own, so this is the only one there will ever be.
           Pressing it both asks the player to pause AND drops the layer's
           opacity, so the motion stops even if the message is ignored.
           It renders only once a heartbeat has arrived: a control for motion
           that never started is worse than none, and reduced motion, an empty
           field and a blocked player therefore all render no button at all.
           `bg-dark/70` is added to the carousel's cream ring deliberately —
           over a moving photographic frame the ring's own contrast (WCAG
           1.4.11) would otherwise be whatever the video happened to be showing.
           The disc makes it measurable. -->
      <button
        type="button"
        data-hero-video-toggle
        aria-label={video.paused ? `Play the ${label}` : `Pause the ${label}`}
        onclick={() => video.toggle()}
        class="{ARROW_SHAPE} {ARROW_TONES.cream} bg-dark/70"
      >
        <PlayPauseGlyph paused={video.paused} />
      </button>
    {/if}
  </div>
{/if}
