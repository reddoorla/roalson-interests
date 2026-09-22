<script lang="ts">
  // The comp's per-section property map (#13): 397 x 595 in the Properties
  // page's left column at 1440, 350 x 200 above the cards at 390, 512 x 827
  // full-bleed on the homepage band and 390 x 200 full-bleed on its phone
  // frame. Sold sections get none (the 1440 tree draws one and its wrapper is
  // `visible: false`).
  //
  // WHAT IS SERVER-RENDERED IS A LIST, NEVER A BOX. #13's definition of done
  // says the no-JS state must not be a blank box, and the honest reading of
  // that is that the FIRST state is the list: every listing's title as a link
  // to `mapsUrl()` — Google Maps centred on its pin, no key, no script, no CSP
  // host. MapLibre is 426 KB and arrives only once this container has
  // intersected the viewport, so on both pages that list is what a visitor
  // sees first even with scripting on, and it is all a crawler or a
  // scripting-off browser ever sees.
  //
  // IT STAYS AFTER THE MAP MOUNTS, and that is the accessibility decision in
  // this file. The pins are `aria-hidden` and `tabindex="-1"`: a marker is a
  // drawing of a list item, and putting both in the tab order would be two
  // stops per listing. Worse, a CLUSTERED listing has no marker of its own at
  // all, so markers-as-controls would put five Boerne tracts behind a zoom
  // gesture for a keyboard user. The list is therefore the map's accessible
  // equivalent for the whole life of the page — visually hidden once the map
  // is drawn, and each link comes back as a garnet chip on the map's own
  // top-left the moment it takes focus, so WCAG 2.4.7 has something to show.
  //
  // WHY THE PINS ARE PLAIN MARKUP AND NOT `maplibregl.Marker`. The operator's
  // call on this build was "more consistency and control over styling is
  // preferable to me". A `{#each}` of <button>s holding an inline SVG filled
  // with `var(--color-primary)` is the comp's pin in the theme's own tokens,
  // keyed by cluster id, with Svelte doing the diffing; MapLibre only supplies
  // `map.project()` and the per-frame loop below writes the transforms. That
  // also keeps `maplibre-gl.css`'s marker and popup skins out of the argument.
  //
  // THE ATTRIBUTION IS A DELIBERATE DEPARTURE FROM THE COMP. The comp has none
  // anywhere, and the Google capture it was drawn over has Google's own
  // cropped off. OpenStreetMap data is ODbL and attribution is a licence
  // condition, not a style choice, so MapLibre's AttributionControl stays —
  // moved to bottom-left, out of the expand affordance's corner, and toned to
  // the brand. tests/interaction/property-map.spec.ts asserts the string
  // "OpenStreetMap" is really on the page rather than that no error appeared.
  //
  // Deep imports, not `{ Expand, Shrink } from "@lucide/svelte"`. That barrel
  // re-exports every icon in the pack as its own .svelte file, and reaching it
  // makes Vitest transform all of them. Measured on this machine, a file that
  // imports this component and asserts nothing: 50.2s through the barrel,
  // 5.5s through these two paths — and PropertyMap.test.ts's fifteen cases now
  // run in 4.6s total. Nothing else changes: same components, same props.
  // Modal.svelte and Accordion.svelte still take the barrel and still pay for
  // it (Modal.test.ts: 37.5s for 18 assertions); that is issue #97, not this
  // file's to change.
  import Expand from "@lucide/svelte/icons/expand";
  import Shrink from "@lucide/svelte/icons/shrink";
  import { tick } from "svelte";

  import type { MapEngine } from "$lib/map-engine";
  import {
    clusterDiameter,
    clusterPoints,
    COMPACT_MAX_HEIGHT,
    expansionZoom,
    fitCamera,
    frameFor,
    MAP_FRAMES,
    mapStyleUrl,
    PIN_ASPECT,
    PIN_HOLE,
    PIN_PATH,
    PIN_VIEWBOX,
    type MapCluster,
    type MapPoint,
  } from "$lib/property-map";
  import { reducedMotion } from "$lib/transitions";

  interface Props {
    /** The section's pins, in the editor's order — `listingOrder`, which is
     *  also the order the cards are in and the order clustering walks. */
    points: MapPoint[];
    /** Names the map and its list, e.g. "Land". Read as "Map of the Land
     *  listings" / "Land listings on the map". */
    label: string;
    /** "off" never loads MapLibre — the state /dev/a11y-fixtures audits, so
     *  the axe gate stays hermetic (no tile host on the critical path). */
    engine?: "auto" | "off";
    class?: string;
  }

  let { points, label, engine = "auto", class: passedClasses = "" }: Props = $props();

  type MapInstance = InstanceType<MapEngine["Map"]>;

  let boxEl: HTMLDivElement | undefined = $state();
  let canvasHost: HTMLDivElement | undefined = $state();
  let map: MapInstance | null = null;

  /** Only a rendered first frame sets this. Not "the import resolved", not
   *  "no error was thrown" — MapLibre's own `load`, which it fires when the
   *  style and the first tiles are in. The list is visible until then. */
  let ready = $state(false);
  let expanded = $state(false);
  let box = $state({ width: 0, height: 0 });
  let zoom = $state(0);
  let clusterEls = $state<Record<string, HTMLElement | undefined>>({});
  let selected: MapPoint | null = $state(null);
  /** Set by a gesture, never by a resize: once a visitor has driven the map,
   *  a re-fit would yank the view back from under them. */
  let userMoved = false;

  const measured = $derived(box.height > 0);
  const compact = $derived(box.height < COMPACT_MAX_HEIGHT);
  const frame = $derived(MAP_FRAMES[frameFor(box)]);
  const clusters = $derived(
    ready ? clusterPoints(points, zoom, frame.clusterRadius) : ([] as MapCluster[]),
  );

  function camera() {
    return fitCamera(points, box, { padding: frame.padding, maxZoom: frame.maxZoom });
  }

  async function boot(host: HTMLDivElement) {
    let maplibre: MapEngine;
    let styleUrl: string;
    try {
      // `$env/dynamic/public` is imported HERE and not at module scope, and
      // that is not tidiness. Its virtual module reads a global SvelteKit only
      // sets during hydration, so evaluating it under jsdom throws "Cannot read
      // properties of undefined (reading 'env')" — which took down every unit
      // test that merely RENDERS a page holding a map (PropertyListing's and
      // the featured slice's, neither of which has any business knowing this
      // component uses an env var). Deferred to the one path that needs it, it
      // is evaluated exactly where the engine is: in a browser, on demand.
      const [engineModule, publicEnv] = await Promise.all([
        import("$lib/map-engine"),
        import("$env/dynamic/public"),
      ]);
      maplibre = engineModule.default;
      styleUrl = mapStyleUrl(publicEnv.env.PUBLIC_MAP_STYLE_URL);
    } catch (err) {
      // Offline, a blocked chunk, a browser with no WebGL2 — the list below is
      // already the whole content, so there is nothing to fall back TO. Warn
      // so "the map isn't showing" can be triaged instead of guessed at.
      console.warn("[property-map] engine did not load:", err);
      return;
    }
    if (!host.isConnected) return;

    const start = camera();
    const instance = new maplibre.Map({
      container: host,
      style: styleUrl,
      center: start ? [start.lng, start.lat] : [0, 0],
      zoom: start ? start.zoom : 1,
      minZoom: 3,
      maxZoom: 16,
      // The comp's map is flat and north-up; nothing on this site reads a
      // bearing, and a rotated map is a way to get lost on a 200px box.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      // Belt to `$lib/transitions`' braces below: told the preference, MapLibre
      // collapses every easeTo/flyTo of its own to a jumpTo.
      reduceMotion: $reducedMotion,
    });
    map = instance;

    instance.addControl(
      new maplibre.AttributionControl({ compact: false }),
      // Bottom-LEFT: the expand affordance owns bottom-right at 390, and a
      // licence notice may not be the thing a finger covers.
      "bottom-left",
    );

    // MapLibre names the canvas "Map" and gives it role="region", so two maps
    // on the Properties page would be two identically named landmarks.
    instance.getCanvas().setAttribute("aria-label", `${label} listings, interactive map`);

    instance.on("movestart", (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) userMoved = true;
    });
    instance.on("move", reposition);
    instance.on("zoom", () => {
      zoom = instance.getZoom();
      reposition();
    });
    instance.on("load", () => {
      zoom = instance.getZoom();
      ready = true;
      void tick().then(reposition);
    });
  }

  function destroy() {
    map?.remove();
    map = null;
    ready = false;
  }

  /** The per-frame loop. Svelte owns the markers' MARKUP; this owns where they
   *  are, because re-running the keyed `{#each}` sixty times a second to move
   *  seventeen boxes would be the wrong tool. */
  function reposition() {
    const instance = map;
    if (!instance) return;
    for (const cluster of clusters) {
      const el = clusterEls[cluster.id];
      if (!el) continue;
      const p = instance.project([cluster.lng, cluster.lat]);
      // A single listing is a PIN, anchored at its tip (the viewBox stops
      // there); a group is a DISC, centred on the place it stands for.
      const anchor = cluster.points.length === 1 ? "-50%, -100%" : "-50%, -50%";
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(${anchor})`;
    }
  }

  function press(cluster: MapCluster) {
    const instance = map;
    if (!instance) return;
    if (cluster.points.length === 1) {
      selected = cluster.points[0]!;
      return;
    }
    selected = null;
    instance.easeTo({
      center: [cluster.lng, cluster.lat],
      zoom: expansionZoom(cluster, frame.clusterRadius, instance.getMaxZoom()),
      duration: $reducedMotion ? 0 : 400,
    });
  }

  // The container's box, which is the only thing that decides the frame: a
  // 200px-tall map takes the comp's 22px pin and the expand affordance, a
  // 595px one takes its 48px pin and neither. No viewport media query is
  // consulted anywhere in this file, so the SAME rule covers the expanded
  // state — expanding a phone map to 520px makes it a full frame, which is
  // exactly what expanding it is for.
  $effect(() => {
    const el = boxEl;
    // Guarded the way Footer.svelte guards its own: jsdom ships no
    // ResizeObserver, and a component that throws at mount takes every test
    // that merely renders the page down with it. With none, the box is never
    // measured, `measured` stays false, and what is left is the server's list.
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      box = { width: rect.width, height: rect.height };
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Re-fit on a box change, never on a gesture.
  $effect(() => {
    const size = box;
    const instance = map;
    if (!instance || size.width === 0) return;
    instance.resize();
    if (userMoved) return;
    const next = camera();
    if (next) instance.jumpTo({ center: [next.lng, next.lat], zoom: next.zoom });
  });

  $effect(() => {
    void clusters;
    void tick().then(reposition);
  });

  $effect(() => {
    void expanded;
    void tick().then(() => map?.resize());
  });

  $effect(() => {
    if (engine === "off" || points.length === 0) return;
    const host = canvasHost;
    if (!host) return;
    let cancelled = false;
    // HALF OF IT HAS TO BE ON SCREEN, and "half" is the smaller of half the
    // map and half the window — an 837px map in a 400px window can never be
    // half of ITSELF visible, and a threshold it can never cross is a map that
    // never loads.
    //
    // This started as 300px of LEAD (`rootMargin: "300px 0px"`), and what that
    // actually did took measuring rather than reading. The map IS below the
    // fold on the homepage — at 1455x900 the hero is 1007 tall and the map
    // slot's top is at y = 1007, so ZERO pixels of it are on screen at rest.
    // 300px of lead expands the observer's root to 1200, which reaches a map
    // a whole viewport away: it fired at load, and 426 KB of parse plus a
    // WebGL context landed inside the featured carousel's first 4-second
    // dwell. That is measurable from outside — `featured-properties.spec.ts`
    // stamps the carousel's turns in the page, and the first one overshot by
    // 458.6ms, 1029.7ms and 2609.8ms on cold runs, against a spec allowing
    // 300. "A little lead" was the whole defect.
    //
    // Two things were tried and did not fix it, both recorded so they are not
    // tried again. Deferring the boot to `load` + `requestIdleCallback` made
    // it WORSE (the turn was missed outright in two of four runs): nothing
    // about scheduling makes a 426 KB parse cheaper, it only moves which
    // four-second window it lands in. `optimizeDeps.include: ["maplibre-gl"]`
    // (vite.config.ts) took the worst case from 2609.8ms to 364.6ms by
    // stopping Vite discovering the dependency mid-session — a real fix, and a
    // dev-server one that says nothing about production.
    //
    // Requiring half-visibility is what actually removes the conflict, and it
    // is the better rule anyway: a visitor who never scrolls to the map now
    // pays nothing for it, which is what "lazy" was supposed to mean. The
    // price is that the map arrives a little later than it used to — at
    // 1440x900 the homepage band needs about 520px of scroll rather than 107 —
    // and until then its box shows the list of listings, which is the same
    // content. See issue #103.
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((e) => e.isIntersecting);
        if (!entry) return;
        const root = entry.rootBounds?.height ?? window.innerHeight;
        const enough = Math.min(entry.boundingClientRect.height, root) / 2;
        if (entry.intersectionRect.height < enough) return;
        io.disconnect();
        if (!cancelled) void boot(host);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    io.observe(host);
    return () => {
      cancelled = true;
      io.disconnect();
      destroy();
    };
  });
</script>

<!-- Escape closes the sheet. On the window rather than on the box, because the
     box is a <div> with no role and a key handler on one is exactly the
     non-interactive-element interaction the compiler's a11y rules refuse. -->
<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && selected) selected = null;
  }}
/>

{#if points.length > 0}
  <div
    bind:this={boxEl}
    data-property-map
    data-map-ready={ready ? "" : undefined}
    data-expanded={expanded ? "true" : undefined}
    class="relative isolate overflow-hidden bg-light text-primary {passedClasses}"
  >
    <!-- THE CONTENT. First in the DOM and first in the tab order, before the
         canvas and before every control, because it is what the map is a
         picture of. -->
    <ul
      data-map-list
      aria-label="{label} listings"
      class={ready ? "" : "flex h-full flex-col gap-3 overflow-y-auto p-5"}
    >
      {#each points as point (point.id)}
        <li>
          <a
            data-map-link
            href={point.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            class={ready ? "sr-only" : "t-body-2 underline underline-offset-2"}
          >
            {point.title}<span class="sr-only"> — open in Google Maps</span>
          </a>
        </li>
      {/each}
    </ul>

    <!-- MapLibre's own box. `aria-hidden` is not a shortcut: the canvas keeps
         MapLibre's keyboard handler and its own accessible name (set above), so
         it is only the marker OVERLAY that is hidden, and only because the list
         above says the same thing better. -->
    <div
      bind:this={canvasHost}
      class="absolute inset-0 {ready ? '' : 'pointer-events-none opacity-0'}"
    ></div>

    {#if ready}
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {#each clusters as cluster (cluster.id)}
          {@const count = cluster.points.length}
          <button
            bind:this={clusterEls[cluster.id]}
            type="button"
            tabindex="-1"
            aria-hidden="true"
            data-map-pin={count === 1 ? "" : undefined}
            data-map-cluster={count > 1 ? count : undefined}
            onclick={() => press(cluster)}
            class="pointer-events-auto absolute top-0 left-0 cursor-pointer border-0 bg-transparent p-0"
          >
            {#if count === 1}
              <!-- `np_pin-map_4984332` — see $lib/property-map for the five
                   measured numbers and the tangent construction they imply. -->
              <svg
                width={frame.pin}
                height={frame.pin * PIN_ASPECT}
                viewBox={PIN_VIEWBOX}
                aria-hidden="true"
                focusable="false"
                class="block"
              >
                <path d={PIN_PATH} fill="var(--color-primary)" />
                <circle
                  cx={PIN_HOLE.cx}
                  cy={PIN_HOLE.cy}
                  r={PIN_HOLE.r}
                  fill="var(--color-light)"
                />
              </svg>
            {:else}
              {@const d = clusterDiameter(count, frame.pin)}
              <span
                style="width:{d}px;height:{d}px;font-size:{Math.round(d * 0.42)}px"
                class="grid place-items-center rounded-full bg-primary font-semibold text-light
                  tabular-nums"
              >
                {count}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if ready && selected}
      <!-- The comp draws no popup, so this is invented — and it is a SHEET on
           the map's bottom edge rather than a callout on the pin, because the
           390 map is 200px tall and a callout would be most of it plus an
           anchor-flipping problem at every edge. Google links out per the
           operator's ask; both are `target="_blank" rel="noopener noreferrer"`
           and neither costs a CSP change — a link navigation is not governed
           by one, which tests/interaction/property-map.spec.ts measures rather
           than asserts. -->
      <div
        data-map-sheet
        class="absolute inset-x-0 bottom-0 z-[3] flex items-start justify-between gap-4 bg-light/95
          p-4 text-primary"
      >
        <div class="min-w-0">
          <p class="t-h4 truncate">{selected.title}</p>
          <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {#if selected.href}
              <a class="t-body-2 underline underline-offset-2" href={selected.href}>
                View listing<span class="sr-only"> — {selected.title}</span>
              </a>
            {/if}
            <a
              class="t-body-2 underline underline-offset-2"
              href={selected.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get directions<span class="sr-only"> to {selected.title}, in Google Maps</span>
            </a>
          </p>
        </div>
        <button
          type="button"
          onclick={() => (selected = null)}
          aria-label="Close {selected.title}"
          class="-m-2 grid h-11 w-11 shrink-0 cursor-pointer place-items-center"
        >
          <span aria-hidden="true" class="text-lg leading-none">&times;</span>
        </button>
      </div>
    {/if}

    {#if measured && (compact || expanded)}
      <!-- `np_expand_2178917`. The comp draws it on BOTH 390 maps and on
           neither 1440 map, 20.884 x 20.880 with a 2px radius in solid garnet,
           its right and bottom edges exactly 10.0 from the map's, around a
           12.884 x 12.880 off-white four-corner expand glyph.
           ITS BEHAVIOUR IS UNWIRED IN FIGMA (`interactions: []`, a real
           absence — the same read returns interactions for the hero buttons
           and the carousel arrows), so see docs/workJournal.md for why this
           grows the box in place rather than opening Modal.svelte or calling
           requestFullscreen.
           The PAINTED box is the comp's 20.88; the TARGET is 44 x 44 around
           it (WCAG 2.5.8), the same split Nav.svelte and Modal.svelte use. -->
      <button
        type="button"
        data-js-only
        data-map-expand={expanded ? "collapse" : "expand"}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse the ${label} map` : `Enlarge the ${label} map`}
        onclick={() => (expanded = !expanded)}
        class="absolute right-0 bottom-0 z-[2] grid h-11 w-11 cursor-pointer place-items-end
          bg-transparent pr-[10px] pb-[10px]"
      >
        <span
          class="grid h-[20.88px] w-[20.884px] place-items-center rounded-[2px] bg-primary
            text-light"
        >
          {#if expanded}
            <Shrink size={13} strokeWidth={2} aria-hidden="true" />
          {:else}
            <Expand size={13} strokeWidth={2} aria-hidden="true" />
          {/if}
        </span>
      </button>
    {/if}
  </div>
{/if}

<style>
  /* The expanded height, and the reason it is CSS rather than an inline style:
     above `lg` the comp draws no expand affordance at all, so the expanded
     height must simply not exist there — the panel goes back to the 595 its
     caller sets, the measured box stops being compact, and the button
     disappears with it. An inline height would have to be unwound by script on
     a resize, and would beat the caller's class while it was there. */
  @media (max-width: 63.9375rem) {
    [data-expanded="true"] {
      height: min(70dvh, 520px);
    }
  }

  /* The focused chip. The list is `sr-only` once the map is drawn, and an
     `sr-only` link that takes focus is a WCAG 2.4.7 failure with nothing to
     show — so a focused one comes back on the map's own top-left, in the
     brand's garnet, over everything. Written here rather than as
     `focus:not-sr-only` because that utility's `position: static` and an
     authored `absolute` are the same specificity, and which one wins is
     decided by the stylesheet's order rather than by the class attribute's —
     exactly the defect HeroBackgroundVideo.svelte records paying for. */
  [data-map-ready] [data-map-link]:focus {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 4;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    clip-path: none;
    white-space: nowrap;
    background-color: var(--color-primary);
    color: var(--color-light);
    padding: 8px 12px;
    text-decoration: underline;
  }

  /* MapLibre's attribution, toned to the brand. It is a licence condition, so
     it is legible rather than hidden: sand ground, garnet text, and the
     4.5:1 the palette already measures for that pair (8.87:1). */
  :global([data-property-map] .maplibregl-ctrl-attrib) {
    background-color: color-mix(in srgb, var(--color-light) 88%, transparent);
    color: var(--color-primary);
    font-size: 10px;
    line-height: 1.4;
    padding: 2px 6px;
  }
  :global([data-property-map] .maplibregl-ctrl-attrib a) {
    color: var(--color-primary);
    text-decoration: underline;
  }
  :global([data-property-map] .maplibregl-ctrl-bottom-left) {
    z-index: 2;
  }
</style>
