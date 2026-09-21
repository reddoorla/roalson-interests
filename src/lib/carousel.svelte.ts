// Headless carousel / slideshow state — index, loop, autoplay, pause and a
// progress-bar value, all on ONE clock — for markup Slider.svelte's layout
// cannot hold (controls INSIDE the slide's panel, a 2px progress bar, a list
// that is only a carousel below `md`). It owns no markup and no layout: it
// hands back state, commands, and attribute bags to spread, so the right ARIA
// is the easy path.
//
//   const carousel = createCarousel({ count: () => slides.length, autoplay: 4000 });
//
//   <div {...carousel.region}>
//     <div {...carousel.swipe}>
//       {#each slides as slide, i (i)}
//         <div {...carousel.slide(i)} class:opacity-0={!carousel.isActive(i)}>…</div>
//       {/each}
//     </div>
//     <CarouselProgress {carousel} /> <CarouselArrows {carousel} />
//     <p class="sr-only" {...carousel.status}>{carousel.statusText}</p>
//   </div>
//
// Call it during component initialisation — it registers `$effect`s, which
// need an owner (in a test: inside `$effect.root`). On the server the effects
// never run, so it renders slide 1 active, nothing rotating, `hydrated` false.
//
// WHERE THE LOGIC CAME FROM. Slider.svelte, read in full and declined: its
// controls are a row rendered AFTER the viewport, its index is private
// `$state` with no change callback, and its autoplay is a `setInterval` that
// restarts the whole delay after a hover — none of which can carry a bar that
// fills continuously and freezes on pause. Everything Slider gets RIGHT is
// lifted here and pinned by the same cases in carousel.svelte.test.ts: the
// region/slide roles, `aria-hidden` + `inert` off-stage, a live region that is
// polite only when the user is driving, hover and hidden-tab pauses, the APG
// rule that focus entering stops rotation until Play is pressed, no rotation
// under reduced motion (and no dead pause button), and parking at the end
// with loop off. The swipe gesture is lifted too, with Slider's thresholds —
// but only its left/right handling is tested here, and Slider never tested it
// at all, so the thresholds are inherited, not proven.
//
// WHY ONE CLOCK. `progress` and the auto-advance are both read off `elapsed`,
// which one requestAnimationFrame loop accumulates. A bar animated by CSS
// beside a timer in JS is two clocks: they agree until the first pause, and
// then the bar is a decoration. Here a pause stops the loop, so the bar
// freezes where it is and resumes from there; it cannot drift because there is
// nothing for it to drift from.
import { useSwipe, type SwipeCustomEvent } from "svelte-gestures";
import type { HTMLAttributes, HTMLButtonAttributes } from "svelte/elements";
import { reducedMotion } from "$lib/transitions";

type MaybeGetter<T> = T | (() => T);

const read = <T>(value: MaybeGetter<T> | undefined, fallback: T): T =>
  value === undefined ? fallback : typeof value === "function" ? (value as () => T)() : value;

export interface CarouselOptions {
  /** How many slides. Pass a getter (`() => slides.length`) to stay reactive. */
  count: MaybeGetter<number>;
  /** Accessible name for the region — say what is inside ("Featured
   *  properties"), not "Carousel". Or name it from a visible heading with
   *  `labelledby`; when both are given the heading wins. */
  label?: MaybeGetter<string>;
  labelledby?: MaybeGetter<string>;
  /** Wrap past the ends (default). When false the arrows go `aria-disabled` at
   *  the bounds and autoplay parks on the last slide. */
  loop?: MaybeGetter<boolean>;
  /** Dwell per slide in ms; 0 (default) means no autoplay. Pauses on hover and
   *  on a hidden tab; focus entering the carousel stops it until Play is
   *  pressed (APG); never runs under prefers-reduced-motion. */
  autoplay?: MaybeGetter<number>;
  /** ms the consumer's own slide transition takes (a 500ms dissolve, say).
   *  After every change the dwell waits this long before it starts counting,
   *  ON THE SAME CLOCK, so the bar sits at 0 through the dissolve and one loop
   *  costs `count × (autoplay + settle)`. The first slide has nothing to wait
   *  for and starts at once. */
  settle?: MaybeGetter<number>;
  /** False turns the whole thing off — every attribute bag comes back empty
   *  and nothing rotates — for a list that is a carousel only at some widths
   *  (issue #14: stacked cards from `md` up and without script). */
  enabled?: MaybeGetter<boolean>;
}

// `<= 0`, not `< 0`: -0 is a number a style attribute prints as "-0".
const clamp01 = (n: number) => (n <= 0 ? 0 : n > 1 ? 1 : n);

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

export function createCarousel(options: CarouselOptions) {
  let raw = $state(0);
  /** ms into the current slide's dwell; negative while `settle` runs down. */
  let elapsed = $state(0);
  let hovered = $state(false);
  let pageHidden = $state(false);
  let reduced = $state(false);
  let userPaused = $state(false);
  let hydrated = $state(false);

  const count = $derived(Math.max(0, Math.floor(read(options.count, 0)) || 0));
  const last = $derived(Math.max(0, count - 1));
  // A derived clamp rather than an effect that rewrites the index: it holds on
  // the server and on the very frame a list shrinks, with nothing to flush.
  const index = $derived(Math.min(Math.max(0, raw), last));
  const loop = $derived(read(options.loop, true));
  const dwell = $derived(Math.max(0, read(options.autoplay, 0) || 0));
  const settle = $derived(Math.max(0, read(options.settle, 0) || 0));
  const enabled = $derived(read(options.enabled, true));

  const atStart = $derived(!loop && index === 0);
  const atEnd = $derived(!loop && index === last);

  // A pause/play control is owed (WCAG 2.2.2) only where rotation can actually
  // happen. Under reduced motion it never starts, so the control would be dead.
  const eligible = $derived(enabled && dwell > 0 && last > 0 && !reduced);
  // `hydrated` first: on the server, and in a browser that never runs script,
  // there is no clock — so nothing may claim to be rotating (the live region
  // would ship muted for a carousel that will never move).
  const rotating = $derived(
    hydrated && eligible && !userPaused && !hovered && !pageHidden && !atEnd,
  );

  const progress = $derived(!eligible ? 0 : atEnd ? 1 : clamp01(elapsed / dwell));
  const position = $derived(count > 0 ? (index + 1) / count : 0);

  /** Every change of slide — a click, a key, a swipe, the clock — starts the
   *  next dwell from the top (after `settle`). */
  const restart = () => {
    elapsed = settle > 0 ? -settle : 0;
  };

  function step(delta: 1 | -1): boolean {
    if (delta > 0) {
      if (index < last) raw = index + 1;
      else if (loop) raw = 0;
      else return false;
    } else {
      if (index > 0) raw = index - 1;
      else if (loop) raw = last;
      else return false;
    }
    restart();
    return true;
  }

  const next = () => enabled && step(1);
  const prev = () => enabled && step(-1);

  function goTo(target: number) {
    if (!enabled || !Number.isFinite(target)) return;
    raw = Math.min(Math.max(0, Math.floor(target)), last);
    restart();
  }

  const pause = () => {
    userPaused = true;
  };
  const play = () => {
    userPaused = false;
  };
  const toggle = () => {
    userPaused = !userPaused;
  };

  // Effects never run on the server, which is the whole meaning of the flag.
  // (Not a `$derived`: that would be true in the server's markup too.)
  $effect(() => {
    hydrated = true;
    return () => {
      hydrated = false;
    };
  });

  // Only a carousel that can autoplay needs to know about the tab or the OS
  // preference. The preference comes from the app's ONE MediaQueryList
  // (transitions.ts) — a private matchMedia listener here is the copy CLAUDE.md
  // names as a past defect, and the one Slider still carries.
  $effect(() => {
    if (dwell <= 0) return;
    pageHidden = document.visibilityState === "hidden";
    const onVisibility = () => (pageHidden = document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    const forget = reducedMotion.subscribe((value) => (reduced = value));
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      forget();
    };
  });

  // THE clock. It exists only while `rotating` is true: every pause is this
  // effect tearing down, which leaves `elapsed` exactly where it was.
  $effect(() => {
    if (!rotating) return;
    let before = performance.now();
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      // max(0): a frame can be stamped a hair before the effect's own sample.
      const total = elapsed + Math.max(0, now - before);
      before = now;
      if (total >= dwell) step(1);
      else elapsed = total;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  // ── handlers ────────────────────────────────────────────────────────────

  // Declared once: a bag that minted new closures on every read would have
  // Svelte re-attach the listeners each time the label changed.
  const onpointerenter = () => {
    hovered = true;
  };
  const onpointerleave = () => {
    hovered = false;
  };

  /** APG: rotation stops when focus ENTERS and stays stopped after it leaves —
   *  only Play restarts it. "Enters" is read off relatedTarget, so a user who
   *  pressed Play and then tabs on to the arrows is not re-paused against
   *  their own explicit request (Slider pauses on every focusin). */
  function onfocusin(event: FocusEvent) {
    if (!eligible) return;
    const from = event.relatedTarget;
    const region = event.currentTarget;
    if (from instanceof Node && region instanceof Node && region.contains(from)) return;
    userPaused = true;
  }

  /** ArrowLeft / ArrowRight from anything focused inside the region — the
   *  handler sits on the region so no wrapper needs a tabindex. It keeps out
   *  of the way of text fields and of modified arrows (Alt+Left is Back). */
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.isContentEditable || EDITABLE.test(target.tagName)) return;
    }
    event.preventDefault();
    if (event.key === "ArrowLeft") prev();
    else next();
  }

  const onSwipe = (event: SwipeCustomEvent) => {
    if (event.detail.direction === "left") next();
    if (event.detail.direction === "right") prev();
  };
  // Slider's thresholds; pan-y keeps the page scrolling under a finger.
  const swipeAttributes = useSwipe(onSwipe, () => ({
    timeframe: 300,
    minSwipeDistance: 60,
    touchAction: "pan-y",
  }));

  /** What the pause button was showing when the pointer went DOWN on it. A
   *  mouse press focuses the button before it clicks it; that focus is "focus
   *  entering the carousel", so rotation stops and the label flips to Play —
   *  and a plain toggle on the click that follows starts it again: the user
   *  pressed Pause and got Play. (Measured in Chromium on Slider: pressed on
   *  its rim it does exactly this; pressed on its glyph the click is swallowed,
   *  because the node the press began on was swapped out, and it stays paused
   *  by accident. Both paths end paused here.)
   *
   *  So a POINTER click (`detail > 0`) settles on the opposite of what was on
   *  screen when its own press began. A keyboard click (`detail === 0`) has no
   *  press: it toggles what it sees, which by then honestly says Play. The
   *  value is only ever read by a pointer click, and every pointer click is
   *  preceded by its own pointerdown, so a press that is dragged away and
   *  never clicks leaves nothing stale behind. It is deliberately NOT cleared
   *  on pointerleave: by the Pointer Events ordering a touch fires pointerleave
   *  BEFORE its click (from the spec — not measured on a device here). */
  let pressedWhilePaused: boolean | null = null;

  const EMPTY = {};

  return {
    // ── state ─────────────────────────────────────────────────────────────
    get index() {
      return index;
    },
    get count() {
      return count;
    },
    /** 0..1 through the current slide's dwell; frozen by every pause; 0 when
     *  this carousel cannot autoplay (then draw `position` instead). */
    get progress() {
      return progress;
    },
    /** (index + 1) / count — what a bar shows when nothing is timing out. */
    get position() {
      return position;
    },
    /** Autoplay is possible here at all: render the pause control iff this. */
    get eligible() {
      return eligible;
    },
    /** The clock is running right now. */
    get rotating() {
      return rotating;
    },
    /** Stopped by the user — the pause button, or focus entering. */
    get paused() {
      return userPaused;
    },
    get atStart() {
      return atStart;
    },
    get atEnd() {
      return atEnd;
    },
    get enabled() {
      return enabled;
    },
    /** False on the server and until effects run: script has adopted it. */
    get hydrated() {
      return hydrated;
    },
    isActive: (i: number) => i === index,

    // ── commands ──────────────────────────────────────────────────────────
    next,
    prev,
    goTo,
    pause,
    play,
    toggle,

    // ── attribute bags ────────────────────────────────────────────────────
    /** The carousel's outer element. */
    get region(): HTMLAttributes<HTMLElement> {
      if (!enabled) return EMPTY;
      const labelledby = read(options.labelledby, "");
      return {
        role: "region",
        "aria-roledescription": "carousel",
        "aria-label": labelledby ? undefined : read(options.label, "") || undefined,
        "aria-labelledby": labelledby || undefined,
        onpointerenter,
        onpointerleave,
        onfocusin,
        onkeydown,
      };
    },
    /** Slide `i`. Off-stage slides leave the accessibility tree AND the tab
     *  order (`inert`), so a link in slide 3 is not reachable behind slide 1. */
    slide(i: number): HTMLAttributes<HTMLElement> {
      if (!enabled) return EMPTY;
      const active = i === index;
      return {
        role: "group",
        "aria-roledescription": "slide",
        "aria-label": `${i + 1} of ${count}`,
        "aria-hidden": active ? undefined : "true",
        // `undefined`, never `false`: a spread sets `inert` as a PROPERTY only
        // where the element has that setter; anywhere it does not, `false`
        // would be written as the attribute inert="false" — which is inert.
        inert: active ? undefined : true,
      };
    },
    /** A visually hidden element holding `statusText`. Polite only while the
     *  user is driving: a rotating carousel announcing every dwell is noise. */
    get status(): HTMLAttributes<HTMLElement> {
      if (!enabled) return EMPTY;
      return { "aria-live": rotating ? "off" : "polite", "aria-atomic": "true" };
    },
    get statusText() {
      return enabled && count > 0 ? `Slide ${index + 1} of ${count}` : "";
    },
    /** The element the slides sit in: swipe left / right. */
    get swipe(): ReturnType<typeof useSwipe> | Record<string, never> {
      return enabled ? swipeAttributes : EMPTY;
    },
    /** Render iff `eligible`, FIRST in the carousel's tab order (APG). */
    get pauseButton(): HTMLButtonAttributes {
      return {
        type: "button",
        "aria-label": userPaused ? "Play slides" : "Pause slides",
        onpointerdown: () => (pressedWhilePaused = userPaused),
        onclick: (event) => {
          const byPointer = event.detail > 0 && pressedWhilePaused !== null;
          userPaused = byPointer ? !pressedWhilePaused : !userPaused;
          pressedWhilePaused = null;
        },
      };
    },
    /** `aria-disabled`, never `disabled`: the arrow at a bound keeps keyboard
     *  focus instead of dumping it on <body>, and pressing it does nothing. */
    get prevButton(): HTMLButtonAttributes {
      return {
        type: "button",
        "aria-label": "Previous slide",
        "aria-disabled": atStart ? "true" : undefined,
        onclick: prev,
      };
    },
    get nextButton(): HTMLButtonAttributes {
      return {
        type: "button",
        "aria-label": "Next slide",
        "aria-disabled": atEnd ? "true" : undefined,
        onclick: next,
      };
    },
  };
}

export type Carousel = ReturnType<typeof createCarousel>;
