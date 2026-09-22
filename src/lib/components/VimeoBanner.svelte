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
  // This banner still ships no pause control; issue filed. Its embed never
  // starts in the one place the site renders it (the a11y fixtures page, where
  // nothing engages), so it is a latent gap rather than a live one.
  import Img from "$lib/components/Img.svelte";
  import { backgroundEmbedSrc, VimeoBackground } from "$lib/utils/vimeoBackground.svelte";

  interface Props {
    vimeoId: string;
    poster: unknown; // ?as=run import
    alt: string;
  }
  let { vimeoId, poster, alt }: Props = $props();

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
</section>
