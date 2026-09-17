<script lang="ts">
  import { Menu, X, ChevronDown } from "@lucide/svelte";
  import { trapFocus } from "$lib/actions/trapFocus";
  import { fade } from "$lib/transitions";
  import type { NavItem } from "$lib/site-config";

  interface NavLink {
    text: string;
    href: string;
  }

  interface Props {
    /** Optional per-route override of the `$lib/site-config.json` nav (no
     * route in the bare template supplies this). When non-empty they take
     * precedence — inline links on desktop, a focus-trapped full-screen menu
     * on mobile. */
    navLinks?: NavLink[];
    /** Nav entries — a leaf is a link; an entry with `children` is a dropdown.
     * Omit for a logo-only bar (the bare-template default; comes from
     * site-config). */
    items?: NavItem[];
    /** The site logo (resolved from site-config); falls back to the "Logo"
     * wordmark. */
    logo?: { url: string; maxWidth?: string };
  }

  let { navLinks = [], items = [], logo }: Props = $props();

  let isMenuOpen = $state(false);
  let openButtonEl = $state<HTMLButtonElement>();
  // Which dropdown is expanded. Desktop click-toggles + hover/focus reveal;
  // mobile is a tap accordion.
  let openMobileIndex = $state<number | null>(null);
  let openDesktopIndex = $state<number | null>(null);

  // A route's flat `navLinks` prop override wins when supplied; every other
  // route falls back to the site-config `items`/`logo` dropdown nav.
  const useNavLinks = $derived(navLinks.length > 0);

  const openMenu = () => (isMenuOpen = true);
  const closeMenu = () => {
    isMenuOpen = false;
    openMobileIndex = null;
  };

  /** The overlay's id, so the trigger and the Close can both point at it. The
   *  trigger unmounts while the menu is open and the overlay renders its own
   *  Close in the same slot, so no single element can carry a flipping
   *  aria-expanded — `[aria-controls="nav-menu"]` is the stable handle whose
   *  state reads false then true across the swap. */
  const MENU_ID = "nav-menu";

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

  // Additive and monochrome on purpose: the glyph dips while held. Beachfront's
  // coloured brand pill is NOT ported — this template ships a neutral
  // placeholder palette with no brand colourway to key it to. The focus ring
  // comes from app.css's `:focus-visible` floor (#133), so neither control
  // needs one of its own.
  const ICON_GLYPH =
    "inline-flex items-center justify-center transition-[opacity,scale] duration-150 ease-out " +
    "motion-reduce:transition-none group-active:scale-90 group-active:opacity-70 " +
    "group-data-[pressed]:scale-90 group-data-[pressed]:opacity-70";
</script>

{#if useNavLinks}
  <!-- navLinks (per-route override) chrome: inline links on desktop,
       focus-trapped full-screen menu on mobile. -->
  <nav class="fixed top-0 left-0 z-50 flex w-full items-center justify-between px-8 py-4">
    <a href="/" class="text-lg font-bold">Logo</a>

    <div class="hidden items-center gap-8 lg:flex">
      {#each navLinks as link (link.href)}
        <a href={link.href}>{link.text}</a>
      {/each}
    </div>

    {#if !isMenuOpen}
      <button
        bind:this={openButtonEl}
        type="button"
        class="group flex min-h-11 min-w-11 items-center justify-center lg:hidden"
        onclick={openMenu}
        aria-label="Open menu"
        aria-expanded={isMenuOpen}
        aria-controls={MENU_ID}
        {...pressProps("trigger")}
      >
        <span class={ICON_GLYPH}>
          <Menu size={24} />
        </span>
      </button>
    {/if}
  </nav>
{:else}
  <!-- site-config (#71) chrome: logo + dropdown nav. -->
  <nav
    class="fixed top-0 left-0 z-50 flex w-full items-center justify-between bg-background/95 px-8 py-4 backdrop-blur-sm"
  >
    <a href="/" class="flex items-center text-lg font-bold">
      {#if logo}
        <img
          src={logo.url}
          alt="Home"
          class="h-8 w-auto"
          style={logo.maxWidth ? `max-width:${logo.maxWidth}` : undefined}
        />
      {:else}
        Logo
      {/if}
    </a>

    {#if items.length > 0}
      <!-- Desktop: inline top items. An item with children is a disclosure —
           click toggles it (aria-expanded), and hover/focus-within also reveal it
           for pointer/keyboard-tab users. Keyed by index: nav labels/hrefs aren't
           unique (two "" heading hrefs or repeated labels would collide and Svelte
           throws each_key_duplicate at hydration). -->
      <ul class="hidden items-center gap-8 lg:flex">
        {#each items as item, i (i)}
          {#if item.children && item.children.length > 0}
            <li class="group relative">
              <button
                type="button"
                class="flex items-center gap-1"
                aria-expanded={openDesktopIndex === i}
                aria-controls="nav-dropdown-{i}"
                onclick={() => (openDesktopIndex = openDesktopIndex === i ? null : i)}
                onkeydown={(e) => {
                  if (e.key === "Escape") openDesktopIndex = null;
                }}
              >
                {item.label}
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              <ul
                id="nav-dropdown-{i}"
                class="absolute top-full left-0 flex min-w-48 flex-col gap-1 bg-background p-2 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                class:invisible={openDesktopIndex !== i}
                class:opacity-0={openDesktopIndex !== i}
              >
                {#each item.children as child, ci (ci)}
                  <li>
                    {#if child.href}
                      <a href={child.href} class="block px-3 py-2 hover:opacity-70">{child.label}</a
                      >
                    {:else}
                      <span class="block px-3 py-2">{child.label}</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </li>
          {:else if item.href}
            <li><a href={item.href}>{item.label}</a></li>
          {:else}
            <li><span>{item.label}</span></li>
          {/if}
        {/each}
      </ul>

      {#if !isMenuOpen}
        <button
          bind:this={openButtonEl}
          type="button"
          class="group flex min-h-11 min-w-11 items-center justify-center lg:hidden"
          onclick={openMenu}
          aria-label="Open menu"
          aria-expanded={isMenuOpen}
          aria-controls={MENU_ID}
          {...pressProps("trigger")}
        >
          <span class={ICON_GLYPH}>
            <Menu size={24} />
          </span>
        </button>
      {/if}
    {/if}
  </nav>
{/if}

{#if isMenuOpen}
  <!-- The open trigger above unmounts while the menu is open, so the element
       trapFocus captured is detached by close time — `restoreFocus` hands it
       the re-mounted trigger instead. -->
  {#if useNavLinks}
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      id={MENU_ID}
      class="fixed inset-0 z-50 flex h-dvh w-screen flex-col items-center justify-center gap-8 bg-background lg:hidden"
      transition:fade
      use:trapFocus={{ onEscape: closeMenu, restoreFocus: () => openButtonEl }}
    >
      <button
        type="button"
        class="group absolute top-4 right-8 flex min-h-11 min-w-11 items-center justify-center"
        onclick={closeMenu}
        aria-label="Close menu"
        aria-expanded={isMenuOpen}
        aria-controls={MENU_ID}
        {...pressProps("close")}
      >
        <span class={ICON_GLYPH}>
          <X size={24} />
        </span>
      </button>

      {#each navLinks as link (link.href)}
        <a href={link.href} class="px-4 py-3" onclick={closeMenu}>{link.text}</a>
      {/each}
    </div>
  {:else}
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      id={MENU_ID}
      class="fixed inset-0 z-50 flex h-dvh w-screen flex-col items-center justify-center gap-4 overflow-y-auto bg-background py-20 lg:hidden"
      transition:fade
      use:trapFocus={{ onEscape: closeMenu, restoreFocus: () => openButtonEl }}
    >
      <button
        type="button"
        class="group absolute top-4 right-8 flex min-h-11 min-w-11 items-center justify-center"
        onclick={closeMenu}
        aria-label="Close menu"
        aria-expanded={isMenuOpen}
        aria-controls={MENU_ID}
        {...pressProps("close")}
      >
        <span class={ICON_GLYPH}>
          <X size={24} />
        </span>
      </button>

      {#each items as item, i (i)}
        {#if item.children && item.children.length > 0}
          <!-- Mobile: a dropdown becomes an accordion — tap to expand its links. -->
          <div class="flex flex-col items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1 px-4 py-2"
              aria-expanded={openMobileIndex === i}
              onclick={() => (openMobileIndex = openMobileIndex === i ? null : i)}
            >
              {item.label}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {#if openMobileIndex === i}
              {#each item.children as child, ci (ci)}
                {#if child.href}
                  <a href={child.href} class="px-4 py-2 opacity-80" onclick={closeMenu}
                    >{child.label}</a
                  >
                {:else}
                  <span class="px-4 py-2 opacity-80">{child.label}</span>
                {/if}
              {/each}
            {/if}
          </div>
        {:else if item.href}
          <a href={item.href} class="px-4 py-3" onclick={closeMenu}>{item.label}</a>
        {:else}
          <span class="px-4 py-3">{item.label}</span>
        {/if}
      {/each}
    </div>
  {/if}
{/if}
