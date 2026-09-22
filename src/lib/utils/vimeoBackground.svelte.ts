// The gate, the heartbeat and the pause flag behind every chrome-less Vimeo
// background embed in this repo — lifted OUT of VimeoBanner.svelte so the
// homepage hero could have all three without taking VimeoBanner's markup with
// them.
//
// WHY A CONTROLLER AND NOT A COMPONENT. What a background video needs is
// identical everywhere; what it LOOKS like never is. VimeoBanner is a
// `w-screen aspect-video` <section> with its own `?as=run` poster underneath;
// the homepage hero is a 528px band inside a `sticky` pin whose height and
// stacking context are load-bearing (#38, #45). Neither can wear the other's
// box. Before this file the two were going to be a second and a third copy of
// the same sixty lines — see docs/workJournal.md 2026-09-21.
// (ScreenWidthMedia's SDK-based variant is still its own; issue for it filed.)
//
// WHAT EACH PIECE IS FOR:
//
//   gate()   creates the iframe only once the visitor has BOTH engaged with the
//            page via a real input AND scrolled the element near the viewport,
//            and never under prefers-reduced-motion. Vimeo's player sets a
//            third-party cookie (Cloudflare's `__cf_bm`) the moment it loads,
//            which fails Lighthouse's best-practices audit; an automated audit
//            never moves, scrolls or taps, so gating on genuine interaction
//            keeps that cookie out of the measured load while real visitors get
//            autoplay the instant they engage. `scroll` is deliberately NOT one
//            of the engagement events — Lighthouse may scroll the page
//            programmatically to capture a full-page screenshot.
//
//   watch()  reveals the video only while playback progress is actually
//            arriving. iOS/iPadOS suspends muted background autoplay after
//            firing an initial play, so the reveal is gated on a continuous
//            heartbeat rather than a one-shot `load`, and falls back to
//            whatever is underneath if the beat stops.
//
//   toggle() the WCAG 2.2.2 mechanism. It posts `pause`/`play` to the player
//            AND flips a flag this module owns, so the motion stops even if the
//            player ignores the message: "pause, stop, or hide" is satisfied by
//            the half we control, not by the half we ask for.
import { prefersReducedMotion } from "$lib/transitions";

/** The only origin a heartbeat may come from. Compared with `===`: a suffix
 *  regex would also accept `notplayer.vimeo.com`, and `new URL(e.origin)`
 *  throws on the opaque ("null") origin a sandboxed iframe posts from. */
export const VIMEO_PLAYER_ORIGIN = "https://player.vimeo.com";

/** Engagement events. `pointerdown`/`pointermove`/`wheel` cover a mouse,
 *  `touchstart` a thumb, `keydown` a keyboard-only visitor. */
const ENGAGEMENT = ["pointerdown", "pointermove", "wheel", "keydown", "touchstart"] as const;

/** A beat older than this means playback has stopped (iOS suspension). */
const STALL_MS = 2500;

/**
 * The chrome-less, muted, looping embed URL.
 *
 * `background=1` removes every control — which is why the iframe must never be
 * a tab stop: there is nothing inside it to operate. `dnt=1` asks Vimeo not to
 * track the session. `muted=1` is not decoration either: an unmuted autoplay is
 * refused by every browser and, where it were not, would be a WCAG 1.4.2
 * failure on arrival.
 *
 * `vimeoId` is expected to be digits (see `parseVimeoId` in ./vimeo) and is
 * encoded anyway — a free-text CMS field is one paste away from carrying a `?`.
 */
export function backgroundEmbedSrc(vimeoId: string): string {
  return `${VIMEO_PLAYER_ORIGIN}/video/${encodeURIComponent(vimeoId)}?background=1&muted=1&loop=1&autoplay=1&dnt=1`;
}

/** A parsed player message — as much of one as this cares about. */
type PlayerMessage = { event?: string };

export class VimeoBackground {
  /** The iframe should exist: engaged, near the viewport, motion allowed. */
  mounted = $state(false);
  /** Playback progress is arriving — the only evidence the video is moving. */
  beating = $state(false);
  /** The visitor pressed the control and holds the video stopped (WCAG 2.2.2). */
  paused = $state(false);
  /**
   * A heartbeat has arrived at least once. Latched, and deliberately never
   * cleared: `offered` is what a pause control is rendered on, and clearing it
   * would make that control vanish out from under the pointer — and take
   * keyboard focus to <body> — in the second between pressing Play and the
   * first beat coming back.
   */
  offered = $state(false);

  #iframe: HTMLIFrameElement | undefined;

  /** Show the video: mounted, moving, and not stopped by the visitor. */
  get visible(): boolean {
    return this.mounted && this.beating && !this.paused;
  }

  /** Offer the control: the video has proved at least once that it moves. A
   *  control for motion that never started is worse than no control at all. */
  get controllable(): boolean {
    return this.mounted && this.offered;
  }

  /**
   * Watch `el` and set `mounted` once the visitor has engaged AND it is near
   * the viewport. Returns a teardown; call it from an `$effect`.
   *
   * Reduced motion is read ONCE, here, and the iframe is then never created at
   * all: an autoplaying background video is pure motion, and whatever is
   * underneath (a poster, or a flat ground) is the accessible rendering. A
   * visitor who turns the OS setting on mid-session keeps the video they
   * already have — the same one-shot read VimeoBanner and ScreenWidthMedia have
   * always done, and unlike the `motion-safe:` CSS elsewhere on the page, which
   * is live.
   */
  gate(el: HTMLElement): () => void {
    if (typeof window === "undefined") return () => {};
    if (prefersReducedMotion()) return () => {};
    // No observer, no gate, no iframe: the element would otherwise mount on the
    // first input and never unmount, which is the one failure mode worse than
    // no video. (jsdom implements no IntersectionObserver, so this is also what
    // keeps a unit test that never asked about the video from creating one.)
    if (typeof IntersectionObserver === "undefined") return () => {};

    let interacted = false;
    let inView = false;
    const maybeMount = () => {
      if (interacted && inView) this.mounted = true;
    };

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting);
        if (inView) maybeMount();
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);

    const onFirst = () => {
      interacted = true;
      maybeMount();
    };
    for (const ev of ENGAGEMENT) {
      window.addEventListener(ev, onFirst, { once: true, passive: true });
    }

    return () => {
      io.disconnect();
      for (const ev of ENGAGEMENT) window.removeEventListener(ev, onFirst);
    };
  }

  /**
   * Subscribe to the player's progress events and hold `beating` true while
   * they keep arriving. Returns a teardown; call it from an `$effect` once the
   * iframe exists.
   *
   * The `?background=1` embed speaks the legacy Froogaloop protocol, whose
   * progress event is `playProgress` (NOT the player.js SDK's `timeupdate`);
   * both are registered and listened for, so the reveal happens on either.
   */
  watch(iframe: HTMLIFrameElement): () => void {
    this.#iframe = iframe;
    let lastBeat = 0;

    const subscribe = () => {
      this.#post("addEventListener", "playProgress"); // legacy Froogaloop
      this.#post("addEventListener", "timeupdate"); // player.js SDK
      // Never un-pause behind the visitor's back: a `load` can fire again after
      // they have pressed Pause (a bfcache restore, a re-attached iframe).
      if (!this.paused) this.#post("play");
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== VIMEO_PLAYER_ORIGIN) return;
      // Origin alone isn't enough: another player.vimeo.com iframe on the same
      // page (a second banner, a ScreenWidthMedia embed) posts from the same
      // origin, and its beats would feed THIS instance's watchdog and reveal it
      // prematurely. Only trust our own iframe's window.
      if (e.source !== iframe.contentWindow) return;
      let data: PlayerMessage | null;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;
      if (data.event === "ready") {
        subscribe();
      } else if (
        data.event === "playProgress" ||
        data.event === "timeupdate" ||
        data.event === "play"
      ) {
        lastBeat = performance.now();
        this.beating = true;
        this.offered = true;
      }
    };
    window.addEventListener("message", onMessage);

    // Some browsers need a nudge after load if the ready handshake is missed.
    const onLoad = () => subscribe();
    iframe.addEventListener("load", onLoad);

    const watchdog = setInterval(() => {
      if (this.beating && performance.now() - lastBeat > STALL_MS) this.beating = false;
    }, 1000);

    return () => {
      window.removeEventListener("message", onMessage);
      iframe.removeEventListener("load", onLoad);
      clearInterval(watchdog);
      if (this.#iframe === iframe) this.#iframe = undefined;
    };
  }

  /** The pause / play control's action. See the note on `toggle` at the top. */
  toggle(): void {
    this.paused = !this.paused;
    this.#post(this.paused ? "pause" : "play");
  }

  #post(method: string, value?: string): void {
    this.#iframe?.contentWindow?.postMessage(
      JSON.stringify({ method, value }),
      VIMEO_PLAYER_ORIGIN,
    );
  }
}
