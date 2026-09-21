<script lang="ts">
  // The site's bar and its menu. The comp (navbar `6850:1503`, `navbar garnet`
  // `6909:1859`, `navbar garnet-mobile` `6997:2189`) draws the bar — wordmark,
  // CONTACT US, and a hamburger at EVERY width, 1440 included — and draws no
  // open state anywhere in the file. The overlay is therefore designed from the
  // system (Stage A call 4): the garnet-to-dark gradient the comp uses for its
  // dark bands, links in the type ramp on the listing page's 397/847 grid.
  //
  // TWO THINGS THE COMP LEAVES OPEN, AND WHAT THIS DOES ABOUT THEM
  //
  // 1. The comp's bar has no fill at any width and is pinned
  //    (`STICKY_SCROLLS`), so as drawn it stays transparent while cards and
  //    body copy scroll underneath it. "navbar garnet" names the WORDMARK's
  //    colour, not a ground. Here the bar FLOATS — transparent, reverse
  //    wordmark, the comp's dust controls — only at the top of a page whose
  //    first band is dark (`over="dark"`), and takes the page's off-white
  //    ground with garnet marks as soon as the page moves. Dust cannot follow
  //    it there: 1.97:1 on off-white, as text or as a control's glyph.
  //
  // 2. Nothing here may depend on script to stay LEGIBLE. A floating bar that
  //    is pinned needs script to re-tone it once light content is under it, so
  //    it is pinned only after mount has proven script runs. Until then — and
  //    forever, with scripting off or a bundle that never arrives — it is
  //    `absolute`: it sits over the dark band it was toned for and scrolls
  //    away with it. At scroll 0 `absolute` and `fixed` paint identically, so
  //    hydration swaps them with nothing to see. The menu's links are the same
  //    rule: a <noscript> list renders them in the bar, and app.html's
  //    `[data-js-only]` hides the trigger that could not have opened anything.
  import { onMount } from "svelte";
  import { trapFocus } from "$lib/actions/trapFocus";
  import { fade, fly } from "$lib/transitions";
  import { lockBodyScroll } from "$lib/utils/scrollLock";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import type { NavItem } from "$lib/site-config";

  interface Props {
    /** The menu's entries. A leaf is a link; an entry with `children` is a
     *  group — its label (linked, if it has an href) over its children. Omit
     *  for a bar with no menu. */
    items?: NavItem[];
    /** The wordmark. `reverseUrl` is the same lockup for dark grounds
     *  (`RI Wordmark Reverse`, 6788:3777) — without it the bar never floats,
     *  because a garnet wordmark on a garnet band is no wordmark. */
    logo?: { url: string; reverseUrl?: string; alt?: string };
    /** The bar's one button — the comp's CONTACT US. Hidden below `sm`, as
     *  in the 390 frame. */
    cta?: { label: string; href: string };
    /** What the bar sits on at the top of THIS page. "dark": the page's first
     *  band runs under the bar (a masthead, a hero) and the bar floats over it.
     *  Anything else: the bar is solid from the start, and the layout pads
     *  <main> by the bar's height. A route claims it with `navOver` in its
     *  page data; src/routes/nav-over.test.ts holds routes to that claim. */
    over?: "dark" | "light";
    /** The current pathname, for `aria-current` in the menu. */
    currentPath?: string;
  }

  let { items = [], logo, cta, over = "light", currentPath = "" }: Props = $props();

  let isMenuOpen = $state(false);
  let openButtonEl = $state<HTMLButtonElement>();
  let mounted = $state(false);
  let scrollY = $state(0);

  /** How far the page may move before the bar takes its ground. Small on
   *  purpose: the bar is re-toned for what is about to be under it, not once
   *  it already is. */
  const FLOAT_UNTIL = 24;

  const canFloat = $derived(over === "dark" && Boolean(logo?.reverseUrl));
  const floating = $derived(canFloat && scrollY <= FLOAT_UNTIL);
  /** Pinned, unless it is a floating bar that script has not yet adopted —
   *  see (2) above. A solid bar is legible over anything, so it pins in the
   *  server's markup. */
  const pinned = $derived(!canFloat || mounted);

  const readScroll = () => (scrollY = window.scrollY);
  onMount(() => {
    readScroll();
    mounted = true;
  });

  const openMenu = () => (isMenuOpen = true);
  const closeMenu = () => (isMenuOpen = false);

  // The page must not slide past behind a full-screen menu — on a phone that
  // reads as the menu having closed. Returned, so every close path releases it.
  $effect(() => {
    if (!isMenuOpen) return;
    return lockBodyScroll();
  });

  /** The overlay's id, so the trigger and the Close can both point at it. The
   *  trigger unmounts while the menu is open and the overlay renders its own
   *  Close in the same slot, so no single element can carry a flipping
   *  aria-expanded — `[aria-controls="nav-menu"]` is the stable handle whose
   *  state reads false then true across the swap. */
  const MENU_ID = "nav-menu";

  const isCurrent = (href: string) =>
    href !== "" && (href === "/" ? currentPath === "/" : currentPath === href);

  // Press feedback that actually fires on touch. `hover:` compiles behind
  // `@media (hover: hover)`, so a phone got no acknowledgement at all from the
  // site's only navigation control — and a tap that looks like nothing happened
  // gets tapped again, the second tap landing after the overlay has mounted and
  // closing it again. `:active` alone would not fix it: a dispatched touchStart
  // leaves `matches(":active")` FALSE in Chromium (measured on
  // beachfront-dentistry at 1440 and 390, held 600ms), so the press is driven by
  // POINTER events and surfaced as `data-pressed`. The `group-active:` variants
  // ride alongside purely for keyboard Space, which browsers do deliver as
  // `:active` and which produces no pointer event.
  //
  // Cleared on up/cancel/leave/blur so a finger that slides off the control, or
  // a drag the browser turns into a scroll, never leaves it stuck looking held.
  let pressedControl = $state<string | null>(null);
  const pressProps = (key: string) => ({
    "data-pressed": pressedControl === key ? "" : undefined,
    onpointerdown: () => (pressedControl = key),
    onpointerup: () => (pressedControl = null),
    onpointercancel: () => (pressedControl = null),
    onpointerleave: () => (pressedControl = null),
    onblur: () => (pressedControl = null),
  });

  // The focus ring comes from app.css's `:focus-visible` floor, so neither
  // control needs one of its own.
  const ICON_GLYPH =
    "inline-flex items-center justify-center transition-[opacity,scale] duration-150 ease-out " +
    "motion-reduce:transition-none group-active:scale-90 group-active:opacity-70 " +
    "group-data-[pressed]:scale-90 group-data-[pressed]:opacity-70";

  // A 44px target around a 20×16 glyph, pulled 12px into the gutter so the
  // GLYPH's edge — not the target's — lands on the comp's x=1360 / x=370.
  const ICON_BUTTON = "group -mr-3 flex min-h-11 min-w-11 items-center justify-center";

  // The bar's box, shared with the overlay's own bar so the wordmark and the
  // Close sit exactly where the wordmark and the trigger were: 80 tall from
  // `lg`; 70 below it with the content centred on y=45, as the 390 frame draws
  // it (wordmark 30→60). Gutters are the listing page's.
  const BAR =
    "mx-auto flex h-[70px] w-full max-w-[1440px] items-center justify-between " +
    "px-5 pt-5 sm:px-8 lg:h-20 lg:pt-0 xl:px-20";
  const WORDMARK = "relative block w-[93px] shrink-0 lg:w-[145px]";
</script>

<svelte:window onscroll={readScroll} />

{#snippet menuGlyph()}
  <!-- `np_menu_1814288` as exported from Figma node 6850:1477 — that export's
       path, not a redraw: three 20×3 bars in a 20×16 box. `currentColor`, so
       the bar's tone recolours it (the ArrowRight precedent). -->
  <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M0 0.75V3.75H20V0.75H0ZM0 6.5V9.5H20V6.5H0ZM0 12.25V15.25H20V12.25H0Z"
    />
  </svg>
{/snippet}

{#snippet closeGlyph()}
  <!-- Designed from the system — the comp has no close. The menu glyph's own
       20×3 bar, twice, crossed on the box's centre. -->
  <svg
    viewBox="0 0 20 16"
    width="20"
    height="16"
    aria-hidden="true"
    focusable="false"
    class="overflow-visible"
  >
    <g fill="currentColor">
      <rect x="0" y="6.5" width="20" height="3" transform="rotate(45 10 8)" />
      <rect x="0" y="6.5" width="20" height="3" transform="rotate(-45 10 8)" />
    </g>
  </svg>
{/snippet}

<nav
  aria-label="Primary"
  data-floating={floating ? "" : undefined}
  class="top-0 left-0 z-50 w-full transition-colors duration-300 {pinned
    ? 'fixed'
    : 'absolute'} {floating ? 'bg-transparent' : 'bg-background'}"
>
  <div class={BAR}>
    <a href="/" class={WORDMARK}>
      {#if logo}
        <img
          src={logo.url}
          alt={logo.alt ?? "Home"}
          width="383"
          height="123"
          class="block h-auto w-full transition-opacity duration-300 {floating ? 'opacity-0' : ''}"
        />
        {#if logo.reverseUrl}
          <!-- The same lockup for the dark band. Decorative: the link is
               already named by the image above, which stays in the tree at
               opacity 0. -->
          <img
            src={logo.reverseUrl}
            alt=""
            width="383"
            height="123"
            class="absolute inset-0 h-auto w-full transition-opacity duration-300 {floating
              ? ''
              : 'opacity-0'}"
          />
        {/if}
      {:else}
        <span class="t-h4 {floating ? 'text-white' : 'text-primary'}">Home</span>
      {/if}
    </a>

    <div class="flex items-center gap-2">
      {#if items.length > 0}
        <!-- Scripting off: the menu cannot open, so its links come to the bar.
             "/" is left out — the wordmark is that link — which is what lets
             the rest fit beside a 93px wordmark at 390.
             NO CLASS ON THIS ELEMENT. With scripting ON a browser keeps
             <noscript> in the tree with its contents as raw TEXT. Chromium
             gives the element no box (measured on the production build: 0×0,
             248 characters inside) — but `display: contents` hands that text
             to the parent to lay out, and `class="contents"` printed this
             list's markup across the bar. tests/interaction/nav.spec.ts looks. -->
        <noscript>
          <ul
            class="t-h6 mr-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 {floating
              ? 'text-dust'
              : 'text-primary'}"
          >
            {#each items.filter((item) => item.href && item.href !== "/") as item, i (i)}
              <!-- From `sm` the CTA is in the bar and already is this link. -->
              <li class={item.href === cta?.href ? "sm:hidden" : undefined}>
                <a href={item.href} class="hover:underline">{item.label}</a>
              </li>
            {/each}
          </ul>
        </noscript>
      {/if}

      {#if cta}
        <div class="hidden sm:block">
          <BrandButton href={cta.href} tone={floating ? "dust" : "garnet"}>{cta.label}</BrandButton>
        </div>
      {/if}

      {#if items.length > 0 && !isMenuOpen}
        <button
          bind:this={openButtonEl}
          type="button"
          data-js-only
          class="{ICON_BUTTON} transition-colors duration-300 {floating
            ? 'text-dust'
            : 'text-primary'}"
          onclick={openMenu}
          aria-label="Open menu"
          aria-expanded={isMenuOpen}
          aria-controls={MENU_ID}
          {...pressProps("trigger")}
        >
          <span class={ICON_GLYPH}>{@render menuGlyph()}</span>
        </button>
      {/if}
    </div>
  </div>
</nav>

{#if isMenuOpen}
  <!-- The open trigger above unmounts while the menu is open, so the element
       trapFocus captured is detached by close time — `restoreFocus` hands it
       the re-mounted trigger instead. -->
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Menu"
    id={MENU_ID}
    class="fixed inset-0 z-[60] flex h-dvh flex-col overflow-y-auto bg-gradient-to-b from-primary to-dark text-light"
    transition:fade={{ duration: 200 }}
    use:trapFocus={{ onEscape: closeMenu, restoreFocus: () => openButtonEl }}
  >
    <div class="{BAR} shrink-0">
      <a href="/" class={WORDMARK} onclick={closeMenu}>
        {#if logo}
          <img
            src={logo.reverseUrl ?? logo.url}
            alt={logo.alt ?? "Home"}
            width="383"
            height="123"
            class="block h-auto w-full"
          />
        {:else}
          <span class="t-h4 text-white">Home</span>
        {/if}
      </a>
      <button
        type="button"
        data-autofocus
        class="{ICON_BUTTON} text-dust"
        onclick={closeMenu}
        aria-label="Close menu"
        aria-expanded={isMenuOpen}
        aria-controls={MENU_ID}
        {...pressProps("close")}
      >
        <span class={ICON_GLYPH}>{@render closeGlyph()}</span>
      </button>
    </div>

    <!-- The listing page's grid, so the links start on the same x as its H1
         and its cards. The bottom pad is the bar's height: the links centre in
         the viewport, not in what the bar left over. -->
    <div
      class="mx-auto grid w-full max-w-[1440px] flex-1 content-center gap-y-10 px-5 pt-10 pb-[70px] sm:px-8 lg:grid-cols-[397fr_847fr] lg:gap-x-9 lg:pb-20 xl:px-20"
    >
      <!-- The dialog is already named "Menu"; this is the comp's eyebrow over
           a heading, for the eye only. -->
      <p class="t-h5 text-dust" aria-hidden="true">Menu</p>
      <ul class="flex flex-col gap-10 lg:gap-12">
        {#each items as item, i (i)}
          <li in:fly={{ y: 24, delay: 60 + i * 60, duration: 400 }}>
            {#if item.href}
              <a
                href={item.href}
                aria-current={isCurrent(item.href) ? "page" : undefined}
                class="t-h2 lg:t-h1 inline-block decoration-dust decoration-2 underline-offset-8 hover:underline aria-[current=page]:text-dust"
                onclick={closeMenu}
              >
                {item.label}
              </a>
            {:else}
              <span class="t-h4 block text-dust">{item.label}</span>
            {/if}
            {#if item.children && item.children.length > 0}
              <ul class="mt-8 flex flex-col gap-6">
                {#each item.children as child, ci (ci)}
                  <li>
                    {#if child.href}
                      <a
                        href={child.href}
                        aria-current={isCurrent(child.href) ? "page" : undefined}
                        class="t-h3 inline-block decoration-dust decoration-2 underline-offset-4 hover:underline aria-[current=page]:text-dust"
                        onclick={closeMenu}
                      >
                        {child.label}
                      </a>
                    {:else}
                      <span class="t-h3 block">{child.label}</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
