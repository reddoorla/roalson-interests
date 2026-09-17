import { reducedMotion } from "$lib/transitions";

export type AnimateInOptions = {
  trigger?: boolean;
  duration?: number;
  delayMax?: number;
  translateY?: string;
  /** Fixed per-step reveal delay (ms). When set, the element waits
   *  `index * stagger` before revealing instead of the default delay derived
   *  from its horizontal position — use it for grids and columns, where the
   *  position heuristic doesn't produce a clean sequence. Viewport mode only. */
  stagger?: number;
  /** This element's position in its group; pairs with `stagger`. Default 0. */
  index?: number;
  /** Viewport mode only: force the revealed state this many ms after mount if
   *  the reveal has not run by then. However the reveal machinery fails — an
   *  IntersectionObserver that never fires (sandboxed review iframes), or
   *  requestAnimationFrame throttled to a stop in a background tab — the
   *  element must not persist at opacity 0. When the normal reveal has already
   *  run the timer is cleared.
   *
   *  Opt-in per element, and REQUIRED on any element whose server-rendered
   *  markup carries `data-reveal` (see applyHidden): that element is hidden by
   *  CSS before JS runs, so a broken observer leaves it invisible rather than
   *  merely unanimated. A blanket timer is deliberately not the default — it
   *  would pre-reveal below-fold content before it is ever scrolled to. */
  failSafe?: number;
};

export type AnimateInParam = boolean | AnimateInOptions | undefined;

type ResolvedConfig = {
  mode: "viewport" | "triggered";
  trigger: boolean;
  duration: number;
  delayMax: number;
  translateY: string;
  stagger: number | null;
  index: number;
  failSafe: number | null;
};

function resolveConfig(param: AnimateInParam): ResolvedConfig {
  const isTriggered =
    typeof param === "boolean" ||
    (param !== undefined && typeof param === "object" && "trigger" in param);

  const opts: AnimateInOptions = typeof param === "object" && param !== null ? param : {};
  const trigger = typeof param === "boolean" ? param : (opts.trigger ?? false);

  return {
    mode: isTriggered ? "triggered" : "viewport",
    trigger,
    duration: opts.duration ?? 2400,
    delayMax: opts.delayMax ?? 400,
    translateY: opts.translateY ?? "50%",
    stagger: opts.stagger ?? null,
    index: opts.index ?? 0,
    failSafe: opts.failSafe ?? null,
  };
}

function applyHidden(node: HTMLElement, cfg: ResolvedConfig) {
  // The attribute is the declarative twin of the two style writes below:
  // app.css hides `[data-reveal]` under `prefers-reduced-motion: no-preference`
  // with the same opacity and the same travel, so markup that ships the
  // attribute FROM THE SERVER is already hidden at first paint and this call
  // re-writes byte-identical values instead of yanking a painted element out
  // from under the reader. Without it content paints in final position, sits
  // there, and vanishes at hydration — which reads as the page breaking.
  //
  // Only true for the DEFAULT travel, which is what the CSS rule hard-codes
  // (src/reveal-hidden-state.test.ts asserts the two agree). A call site
  // passing its own `translateY` must NOT put `data-reveal` in its
  // server-rendered markup, because CSS would hide it at a different distance
  // than JS reveals it from. Pair a server-rendered marker with `failSafe`.
  node.setAttribute("data-reveal", "");
  node.style.opacity = "0";
  node.style.transform = `translateY(${cfg.translateY})`;
  node.style.transition =
    `opacity ${cfg.duration}ms var(--transition-fast-slow), ` +
    `transform ${cfg.duration}ms var(--transition-fast-slow)`;
}

function reveal(node: HTMLElement) {
  // Drop the marker before the styles: nothing may be able to describe this
  // element as hidden once it is on its way to visible.
  node.removeAttribute("data-reveal");
  node.style.opacity = "1";
  node.style.transform = "translateY(0)";
}

export function animateIn(node: HTMLElement, param?: AnimateInParam) {
  const cfg = resolveConfig(param);
  let observer: IntersectionObserver | undefined;
  let failSafeTimer: ReturnType<typeof setTimeout> | undefined;
  let reduced = false;
  let hidden = false;

  // --- releasing the reveal's inline transition ------------------------------
  //
  // `applyHidden` writes `style.transition` INLINE, and an inline declaration
  // outranks every class. Left in place it stays the element's transition list
  // for the rest of the page's life — 2400ms of `opacity, transform` on the
  // reveal's curve — which silently disables the hover motion of anything that
  // both reveals and reacts. A card asking for `transition-[box-shadow,translate]
  // duration-200` gets neither channel: the inline list names `transform`, not
  // `translate`, and not `box-shadow`, so the hover just snaps.
  //
  // So the element is handed back to its stylesheet once the reveal is over.
  // `transitionend` is the accurate signal; the timer is the fallback for every
  // path where no transition ever runs (reduced motion, the
  // no-IntersectionObserver reveal-in-place, a triggered mount that hides and
  // shows in one frame) and for a `transitionend` lost to a background tab.
  // Re-hiding re-writes all of it, so triggered call sites still work.
  let revealDelay = 0;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  function onTransitionEnd(e: TransitionEvent) {
    // Only this node's own reveal — a descendant's transition bubbles here too,
    // and releasing on one would strip the transition mid-reveal.
    if (e.target !== node) return;
    if (e.propertyName !== "opacity") return;
    release();
  }

  const cancelRelease = () => {
    node.removeEventListener("transitionend", onTransitionEnd as EventListener);
    if (releaseTimer !== undefined) {
      clearTimeout(releaseTimer);
      releaseTimer = undefined;
    }
  };

  function release() {
    cancelRelease();
    // Back to the authored markup: the element keeps whatever its classes say.
    node.style.removeProperty("transition");
    node.style.removeProperty("transition-delay");
    node.style.removeProperty("transform");
    node.style.removeProperty("opacity");
  }

  const scheduleRelease = () => {
    cancelRelease();
    node.addEventListener("transitionend", onTransitionEnd as EventListener);
    releaseTimer = setTimeout(release, cfg.duration + revealDelay + 300);
  };

  const hide = () => {
    hidden = true;
    // A re-hide must cancel a pending release, or the release lands mid-reveal
    // and strips the transition the new hide just wrote.
    cancelRelease();
    applyHidden(node, cfg);
  };
  const show = () => {
    hidden = false;
    reveal(node);
    scheduleRelease();
  };

  // Watched, not sampled: turning the OS setting on mid-session stops the
  // reveals where the reader is instead of on their next reload. It only ever
  // moves in the SAFE direction — whatever is hidden is revealed and the
  // machinery torn down. Re-applying the hidden state on a switch would strand
  // content at opacity 0 with nothing left running to un-hide it — the exact
  // failure `failSafe` exists to catch.
  const unwatch = reducedMotion.subscribe((value) => {
    reduced = value;
    if (!value) return;
    if (failSafeTimer !== undefined) clearTimeout(failSafeTimer);
    observer?.disconnect();
    // `hidden` is false on the first, synchronous call, so an element that was
    // never touched keeps its untouched inline styles — the action stays a
    // complete no-op when the preference is already on. The attribute test
    // catches SERVER-RENDERED `data-reveal`, whose CSS hidden state does not
    // apply under reduce but whose marker should not linger either.
    if (hidden || node.hasAttribute("data-reveal")) show();
  });

  if (reduced) {
    return {
      update() {},
      destroy() {
        unwatch();
      },
    };
  }

  if (cfg.mode === "triggered") {
    if (cfg.trigger) {
      hide();
      show();
    } else {
      hide();
    }
  } else {
    hide();
    // Explicit index-based stagger (grids/columns) overrides the default
    // horizontal-position heuristic (which only sequences a left-to-right row).
    const delay =
      cfg.stagger !== null
        ? cfg.index * cfg.stagger
        : cfg.delayMax * (node.getBoundingClientRect().left / window.innerWidth);
    revealDelay = delay;
    node.style.transitionDelay = `${delay}ms`;

    // No IntersectionObserver at all (stripped-down embed, ancient browser):
    // nothing else can ever reveal this element, and constructing the observer
    // below would THROW and take the whole mount with it. Reveal in place —
    // both style writes land in one synchronous frame, so the element is simply
    // visible with no transition, which beats invisible forever.
    if (typeof IntersectionObserver === "undefined") {
      show();
      return {
        update() {},
        destroy() {
          unwatch();
          cancelRelease();
        },
      };
    }

    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          if (failSafeTimer !== undefined) clearTimeout(failSafeTimer);
          observer?.disconnect();
        }
      },
      { threshold: 0 },
    );
    observer.observe(node);

    // See AnimateInOptions.failSafe. setTimeout (not rAF) on purpose: timers
    // still fire, if clamped, where rAF is suspended. Revealing twice is
    // harmless, so losing the race to the normal reveal costs nothing.
    if (cfg.failSafe !== null) {
      failSafeTimer = setTimeout(() => {
        observer?.disconnect();
        show();
      }, cfg.failSafe);
    }
  }

  return {
    /** In triggered mode, only the `trigger` field of `next` is read — other options are locked at mount. */
    update(next?: AnimateInParam) {
      if (cfg.mode !== "triggered") return;
      const nextCfg = resolveConfig(next);
      // Under reduced motion the element must never go back to hidden: the
      // watcher above has already torn everything down, so nothing would be
      // left to reveal it again.
      if (nextCfg.trigger || reduced) {
        show();
      } else {
        hide();
      }
    },
    destroy() {
      unwatch();
      if (failSafeTimer !== undefined) clearTimeout(failSafeTimer);
      cancelRelease();
      observer?.disconnect();
    },
  };
}
