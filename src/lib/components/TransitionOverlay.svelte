<!--
  TransitionOverlay — a brief wash of colour ACROSS a client navigation. It
  mounts when SvelteKit starts navigating and lifts once the incoming route has
  painted (unlike PreNavTransition, which cancels the nav to cover the OUTGOING
  page first — use one or the other, never both).

  Usage (root +layout.svelte):
    <TransitionOverlay />
    <TransitionOverlay class="fixed top-0 left-0 z-50 h-screen w-screen bg-white" />

  The cover lasts `real navigation latency + visibleDuration + fadeOutDuration`.
  It used to be `latency + 1050 + 700`: measured on beachfront-dentistry at
  1440x900, a navigation that committed at 247ms was opaque from 17ms to 1309ms
  and only gone at 1998ms — nearly two seconds of cover over a page that had
  been ready for 1.7s of it. With no `pointer-events-none`, `elementFromPoint`
  returned this div for all of it, so a second tap was silently eaten. The
  durations below cover the same navigation for 464ms against a production
  build, 677ms throttled to 4x CPU and Fast 3G.

  Which navigations get a wash is `shouldIntercept` — the same predicate that
  governs PreNavTransition, so the pair cannot disagree about it. Every clause
  earns its place here: reduced motion wants no full-screen flash at all;
  back/forward should feel instant; and an UNLOADING navigation (external link,
  full reload) is the one case that could strand the sheet, because
  `afterNavigate` never arrives to lift it.
-->
<script lang="ts">
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { fade, prefersReducedMotion } from "$lib/transitions";
  import { shouldIntercept } from "$lib/utils/preNavIntercept";

  interface Props {
    /** ms the cover holds once the incoming route has arrived. */
    visibleDuration?: number;
    /** ms the cover takes to wash in once navigation starts. */
    fadeInDuration?: number;
    /** ms the cover takes to lift. */
    fadeOutDuration?: number;
    class?: string;
  }

  let {
    // Not 0: `afterNavigate` runs before the browser has painted the incoming
    // route, so lifting immediately shows one frame of the OLD page. A couple
    // of frames of hold is the whole job.
    visibleDuration = 140,
    fadeInDuration = 140,
    fadeOutDuration = 320,
    class: passedClasses = "h-screen w-screen fixed z-50 bg-black top-0 left-0",
  }: Props = $props();

  /** Ceiling on the cover for a navigation that never completes. Past this the
   *  sheet is doing more harm than the swap it hides, so it lifts regardless and
   *  the outgoing page becomes usable again. Without it the only thing that ever
   *  lifted the sheet was `afterNavigate`, so a navigation that errored left the
   *  reader looking at an opaque screen with no way back. */
  const MAX_COVER_MS = 3000;

  let isTransitioning = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let failsafeTimer: ReturnType<typeof setTimeout> | undefined;

  const lift = () => {
    isTransitioning = false;
  };

  const clearTimers = () => {
    clearTimeout(hideTimer);
    clearTimeout(failsafeTimer);
  };

  beforeNavigate((nav) => {
    // A second navigation started while the first was still covered. Its timers
    // belong to a swap that is no longer happening — left running, the stale
    // hide fires mid-cover and flashes the outgoing page through.
    clearTimers();
    if (!shouldIntercept(nav, { reducedMotion: prefersReducedMotion() })) {
      lift();
      return;
    }
    isTransitioning = true;
    failsafeTimer = setTimeout(lift, MAX_COVER_MS);
  });

  afterNavigate(() => {
    // The ceiling is replaced by the short hold, never left running alongside it.
    clearTimers();
    hideTimer = setTimeout(lift, visibleDuration);
  });

  $effect(() => {
    return clearTimers;
  });
</script>

{#if isTransitioning}
  <!-- pointer-events-none so a tap during the wash still reaches the link under
       it (the old sheet ate it); decorative, so hidden from assistive tech.
       Both of those make the sheet unreachable by role and by hit test, so the
       data attribute is the only handle a test has on it. -->
  <div
    aria-hidden="true"
    data-transition-overlay
    class="pointer-events-none {passedClasses}"
    in:fade={{ duration: fadeInDuration }}
    out:fade={{ duration: fadeOutDuration }}
  ></div>
{/if}
