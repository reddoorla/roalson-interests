<script lang="ts">
  // Full-bleed background-video banner. A static poster sits underneath; the
  // muted/looping Vimeo iframe is layered on top and only revealed while
  // playback is actually progressing.
  //
  // The gate (engagement + near-viewport, never under reduced motion), the
  // playback heartbeat and its watchdog used to live inline here. They are now
  // $lib/utils/vimeoBackground.svelte's `VimeoBackground` — moved out unchanged
  // when the homepage hero needed all three and could not take this component's
  // markup with them (2026-09-21). VimeoBanner.test.ts was NOT edited in that
  // move: its seven cases are the evidence the lift changed no behaviour.
  //
  // WCAG 2.2.2: the embed loops, so it carries the hero's pause control (#81),
  // the same button on the same controller. See HeroBackgroundVideo for why
  // the placement sits on a wrapper and not on the button.
  import { ARROW_SHAPE, ARROW_TONES } from "$lib/components/CarouselArrows.svelte";
  import Img from "$lib/components/Img.svelte";
  import PlayPauseGlyph from "$lib/components/PlayPauseGlyph.svelte";
  import { backgroundEmbedSrc, VimeoBackground } from "$lib/utils/vimeoBackground.svelte";

  interface Props {
    vimeoId: string;
    poster: unknown; // ?as=run import
    alt: string;
    /** Names the clip: "Pause the {label}" / "Play the {label}". */
    label?: string;
  }
  let { vimeoId, poster, alt, label = "background video" }: Props = $props();

  const video = new VimeoBackground();
  const src = $derived(backgroundEmbedSrc(vimeoId));

  let sectionEl: HTMLElement | undefined = $state();
  let iframeEl: HTMLIFrameElement | undefined = $state();

  // Two effects, each owning one teardown: the gate watches the banner's box,
  // the heartbeat can only start once the iframe it listens for exists.
  $effect(() => {
    const el = sectionEl;
    if (!el) return;
    return video.gate(el);
  });

  $effect(() => {
    const el = iframeEl;
    if (!el) return;
    return video.watch(el);
  });
</script>

<section bind:this={sectionEl} class="w-screen aspect-video relative overflow-hidden bg-black">
  <!-- Poster (fallback: pre-play, reduced-motion, iOS suspension) -->
  <Img
    src={poster}
    {alt}
    class="absolute inset-0 h-full w-full object-cover"
    loading="eager"
    fetchpriority="high"
  />

  {#if video.mounted}
    <!-- The 16:9 iframe fills the now-16:9 frame exactly, so the video keeps
         its native aspect ratio with no cropping on any breakpoint. -->
    <div
      class="absolute inset-0 h-full w-full transition-opacity duration-700 {video.visible
        ? 'opacity-100'
        : 'opacity-0'}"
    >
      <iframe
        bind:this={iframeEl}
        title={alt}
        {src}
        class="w-full h-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        tabindex="-1"
        aria-hidden="true"
      ></iframe>
    </div>
  {/if}

  <!-- The control's seat: bottom-right, over the video, and never
       `aria-hidden`. The button appears only once a heartbeat has arrived, so
       reduced motion and a blocked player render none. -->
  <div data-vimeo-banner-controls class="absolute right-5 bottom-5 z-10 flex">
    {#if video.controllable}
      <button
        type="button"
        data-vimeo-banner-toggle
        aria-label={video.paused ? `Play the ${label}` : `Pause the ${label}`}
        onclick={() => video.toggle()}
        class="{ARROW_SHAPE} {ARROW_TONES.cream} bg-dark/70"
      >
        <PlayPauseGlyph paused={video.paused} />
      </button>
    {/if}
  </div>
</section>
