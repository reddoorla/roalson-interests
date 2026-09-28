<script lang="ts">
  import { PrismicImage } from "@prismicio/svelte";
  import { cappedWidths } from "@reddoorla/maintenance/images";
  import Img from "@zerodevx/svelte-img";
  import { onMount } from "svelte";
  import { ARROW_SHAPE, ARROW_TONES } from "$lib/components/CarouselArrows.svelte";
  import PlayPauseGlyph from "$lib/components/PlayPauseGlyph.svelte";
  import { VimeoBackground } from "$lib/utils/vimeoBackground.svelte";
  import { viewport } from "$stores/viewport.svelte";

  // The player.js SDK type lives on window (src/global.d.ts) — derive the
  // instance type from there so this file has no ambient type references
  // (which ESLint's no-undef can't resolve in .svelte files).
  type Player = InstanceType<NonNullable<(typeof window)["Vimeo"]>["Player"]>;

  let {
    src = "",
    field = undefined,
    altText = "background image",
    vimeoId = "",
    darken = false,
    backdrop = false,
    percentHeight = 80,
    class: passedClasses = "",
    children = undefined,
  } = $props();

  let videoError: boolean = $state(false);
  // Empty until the browser goes idle — the iframe doesn't exist before then.
  let videoSrc: string = $state("");
  // Keeps the iframe transparent (poster showing through) until the player has
  // ramped past its grainy low-bitrate startup rendition.
  let videoReady: boolean = $state(false);
  let iframeElement: HTMLIFrameElement | undefined = $state();

  // WCAG 2.2.2 (#81): the embed loops, so it needs a pause control. The
  // controller the hero and VimeoBanner use supplies it: `watch` latches
  // `offered` on the first real heartbeat, `toggle` posts pause/play AND
  // holds the iframe hidden. The SDK below still owns the quality reveal.
  const video = new VimeoBackground();
  $effect(() => {
    const el = iframeElement;
    if (!el) return;
    return video.watch(el);
  });
  const controllable = $derived(Boolean(videoSrc) && !videoError && video.offered);

  const coverStyle = $derived(
    ((viewport.height * percentHeight) / 100) * 16 > viewport.width * 9
      ? `height: ${percentHeight}lvh; min-width: 100%`
      : `width: 100vw; min-height: ${percentHeight}lvh`,
  );

  onMount(() => viewport.subscribe());

  // Defer the heavy Vimeo iframe until the browser is idle so the poster and
  // page content paint first instead of competing with the video stream for
  // bandwidth. Autoplay still starts a beat later — imperceptible on fast
  // connections. Under prefers-reduced-motion the video is never created at
  // all: a background video is pure motion, so the poster is the accessible
  // rendering. Both defer paths are cancelled on destroy so a late idle
  // period can't touch state after unmount.
  onMount(() => {
    if (!vimeoId) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const load = () => {
      videoSrc = `https://player.vimeo.com/video/${vimeoId}?background=1&muted=1&loop=1&autoplay=1&dnt=1`;
    };
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(load, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    }
    // Safari has no requestIdleCallback; approximate with a short delay.
    const timeoutId = setTimeout(load, 1200);
    return () => clearTimeout(timeoutId);
  });

  // Runs once the deferred iframe exists. Background embeds start at a grainy
  // low-bitrate rendition and ramp up, so the iframe stays transparent until a
  // 1080p request has buffered (`bufferend`), with a 1.2s soft cap after
  // setQuality is accepted and a 6s hard cap so the poster never sticks. The
  // player.js SDK is loaded on demand and shared across instances; teardown
  // clears every timer, drops script listeners, and destroys the Player so SPA
  // navigation doesn't leak SDK instances. Player errors fall back to the
  // poster by removing the iframe entirely.
  $effect(() => {
    const el = iframeElement;
    if (!el) return;

    let disposed = false;
    let player: Player | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const reveal = () => {
      videoReady = true;
    };
    const hardCap = setTimeout(reveal, 6000);
    timers.push(hardCap);

    const initPlayer = () => {
      if (disposed || !window.Vimeo?.Player) return;
      try {
        player = new window.Vimeo.Player(el);
      } catch {
        return; // SDK init failed — the hard cap still reveals
      }
      player.on("error", () => {
        videoError = true;
      });
      player.ready().catch(() => {
        videoError = true;
      });
      player
        .setQuality("1080p")
        .then(() => {
          // The quality change was accepted after teardown began — don't
          // start a timer nothing will ever clear.
          if (disposed) return;
          const onReady = () => {
            clearTimeout(hardCap);
            reveal();
          };
          player?.on("bufferend", onReady);
          timers.push(setTimeout(onReady, 1200));
        })
        .catch(() => {
          /* some background embeds refuse setQuality — the hard cap still reveals */
        });
    };

    let scriptEl: Element | undefined;
    if (window.Vimeo?.Player) {
      initPlayer();
    } else {
      const existing = document.querySelector(
        'script[src="https://player.vimeo.com/api/player.js"]',
      );
      if (existing) {
        scriptEl = existing;
      } else {
        const script = document.createElement("script");
        script.src = "https://player.vimeo.com/api/player.js";
        document.head.appendChild(script);
        scriptEl = script;
      }
      scriptEl.addEventListener("load", initPlayer);
    }

    return () => {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      scriptEl?.removeEventListener("load", initPlayer);
      player?.destroy().catch(() => {});
    };
  });
</script>

<section
  class="w-screen overflow-clip {backdrop ? 'fixed -z-10 top-0 left-0' : 'relative'}"
  style="height: {percentHeight}lvh"
>
  <div
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 aspect-video"
    style={coverStyle}
  >
    {#if !field && typeof src === "string" && src}
      <img
        {src}
        alt={altText}
        class="absolute bottom-0 left-0 h-full w-full object-cover {passedClasses} -z-10"
      />
    {:else if src}
      <Img
        {src}
        alt={altText}
        class="absolute bottom-0 left-0 h-full w-full object-cover {passedClasses} -z-10"
      />
    {:else if field}
      <!-- Full-bleed backdrop: genuinely 100vw, and usually the LCP element, so
           it stays eager and gets fetch priority. -->
      <PrismicImage
        {field}
        widths={cappedWidths(field)}
        sizes="100vw"
        fetchpriority="high"
        class="absolute h-full w-full object-cover -z-10 {passedClasses}"
      />
    {/if}

    {#if vimeoId && videoSrc && !videoError}
      <!-- Decorative background player: tabindex="-1" + aria-hidden keep
           keyboard/AT users from landing inside a -z-10 iframe they can't
           even see (the chrome-less ?background=1 embed has no controls). -->
      <iframe
        bind:this={iframeElement}
        title="background video"
        src={videoSrc}
        class="aspect-video absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 contrast-[1.15] -z-10 border-0 transition-opacity duration-700 {videoReady &&
        !video.paused
          ? 'opacity-100'
          : 'opacity-0'}"
        style="width: max(100%, 1000px)"
        allow="autoplay; fullscreen"
        tabindex="-1"
        aria-hidden="true"
      ></iframe>
    {/if}

    {#if darken}
      <div
        class="bg-darken-gradient pointer-events-none absolute w-full h-full top-0 left-0 -z-10"
      ></div>
    {/if}
  </div>
  {@render children?.()}
  {#if !backdrop}{@render control("absolute")}{/if}
</section>
<!-- A backdrop is `fixed -z-10`, under the page, so its control cannot sit
     inside it and still take a click: it is seated beside it instead. -->
{#if backdrop}{@render control("fixed")}{/if}

{#snippet control(position: "absolute" | "fixed")}
  <!-- Placement on a wrapper: ARROW_SHAPE opens with `relative`, which beats
       `absolute` in Tailwind's emission order (see HeroBackgroundVideo). -->
  {#if vimeoId}
    <div data-screen-media-controls class="{position} right-5 bottom-5 z-10 flex">
      {#if controllable}
        <button
          type="button"
          data-screen-media-toggle
          aria-label={video.paused ? "Play the background video" : "Pause the background video"}
          onclick={() => video.toggle()}
          class="{ARROW_SHAPE} {ARROW_TONES.cream} bg-dark/70"
        >
          <PlayPauseGlyph paused={video.paused} />
        </button>
      {/if}
    </div>
  {/if}
{/snippet}

<style>
  .bg-darken-gradient {
    background:
      linear-gradient(0deg, rgba(0, 38, 62, 0.5) 0%, rgba(0, 38, 62, 0.5) 100%),
      linear-gradient(180deg, rgba(0, 38, 62, 0.75) -3.96%, rgba(0, 38, 62, 0) 49.92%);
  }
</style>
