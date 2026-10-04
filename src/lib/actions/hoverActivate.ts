/**
 * Hover-to-activate for a list of `data-centre-id` children: a mouse that rests on one for HOVER_DWELL_MS reports it, on fine-pointer hover devices only, ignoring touch, pen and the pointer events a scroll fires under a still mouse.
 */
import { CENTRE_ID } from "./centreWatch";

export const HOVER_DWELL_MS = 200;

export const FINE_HOVER = "(hover: hover) and (pointer: fine)";

export interface HoverActivateOptions {
  onactive: (id: string) => void;
  minWidth: number;
  enabled?: boolean;
  dwellMs?: number;
}

export function hoverActivate(node: HTMLElement, options: HoverActivateOptions) {
  let current = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: string | null = null;
  let lastX = Number.NaN;
  let lastY = Number.NaN;

  const query =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(`${FINE_HOVER} and (min-width: ${options.minWidth}px)`)
      : null;

  const live = () => current.enabled !== false && query?.matches === true;

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    pending = null;
  }

  function onmove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    const moved = event.clientX !== lastX || event.clientY !== lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!moved || !live()) return;
    const card = event.target instanceof Element ? event.target.closest(`[${CENTRE_ID}]`) : null;
    const id = card && node.contains(card) ? card.getAttribute(CENTRE_ID) : null;
    if (id === pending) return;
    cancel();
    if (!id) return;
    pending = id;
    timer = setTimeout(() => {
      timer = undefined;
      pending = null;
      if (live()) current.onactive(id);
    }, current.dwellMs ?? HOVER_DWELL_MS);
  }

  const passive = { passive: true } as const;
  node.addEventListener("pointermove", onmove, passive);
  node.addEventListener("pointerleave", cancel, passive);
  window.addEventListener("scroll", cancel, passive);

  return {
    update(next: HoverActivateOptions) {
      current = next;
      if (!live()) cancel();
    },
    destroy() {
      cancel();
      node.removeEventListener("pointermove", onmove);
      node.removeEventListener("pointerleave", cancel);
      window.removeEventListener("scroll", cancel);
    },
  };
}
