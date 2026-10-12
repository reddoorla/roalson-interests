import type { Locator } from "@playwright/test";

// How a spec gets a map on screen far enough to boot, and no further.
//
// A PropertyMap boots only once half of it is on screen — half of the smaller
// of its own height and the window's (#103; the IntersectionObserver in
// PropertyMap.svelte, which watches `[data-map-canvas]`). At 1440x900 the
// listing's first map sat at y 596 until 2026-09-29, 304 of its 595px showing,
// so it booted at load by 6.5px — and every spec that waited for it at the top
// of /properties or /dev/properties leaned on those 6.5px without saying so.
// That day the listing took the solid bar from the top, <main> gained the bar's
// 80px of padding, the map moved to y 676 (224px showing), and those waits
// timed out against a map that was never going to boot.
//
// `scrollIntoViewIfNeeded` would boot it too, but it CENTRES the map, and at
// `lg` the first card is top-aligned with it — so it puts a card on the centre
// line and makes that listing active, which several camera specs must not
// have happen before they start. This scrolls by the least that satisfies the
// boot rule (plus 2px for rounding), which leaves the map's top edge, and the
// first card's, at the window's height less half the map: below the centre
// line whenever the map is shorter than the window.

/** Scroll the page just far enough for `map` (a `[data-property-map]`) to boot,
 *  if it cannot where it is. Returns how far the page moved: 0 when it can. */
export async function scrollMapToBoot(map: Locator): Promise<number> {
  const need = await map.evaluate((el) => {
    const host = el.querySelector("[data-map-canvas]") ?? el;
    const r = host.getBoundingClientRect();
    const enough = Math.min(r.height, innerHeight) / 2;
    const visible = Math.min(innerHeight, r.bottom) - Math.max(0, r.top);
    if (r.top < 0 || visible >= enough) return 0;
    return Math.ceil(r.top + enough - innerHeight) + 2;
  });
  if (need > 0) {
    await map.page().evaluate((by) => window.scrollBy({ top: by, behavior: "instant" }), need);
  }
  return need;
}
