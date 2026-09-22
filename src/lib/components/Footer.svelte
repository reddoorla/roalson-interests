<script lang="ts">
  // The site's footer — the comp's last `Value Prop #1` band (6820:188 on the
  // Homepage at 1440, 6903:1117 on Properties; 6996:1026 / 6997:2055 at 390).
  // It is layout chrome, not a slice: the comp puts the same band on both page
  // archetypes, /properties and /contact are filesystem routes with no slice
  // zone, and an id-free diff of the Homepage and Properties subtrees (163
  // nodes each) differs in ONE line — the band's own fill, which is `ground`.
  //
  // WHAT IS DRAWN, AND WHAT IS NOT
  //
  // Drawn: the closing headline with its two buttons, the wordmark, a short
  // list of pages, the office's address and phone, and the two Texas Real
  // Estate Commission links. At 1440 the wordmark column is on the left and
  // the headline on the listing column's x (513); at 390 the ORDER FLIPS —
  // headline first, 100px, then the wordmark block — so the headline is first
  // in the DOM and the grid places the other block back in column 1.
  //
  // HIDDEN in all six frames, and so not built: a "Have Questions?" eyebrow, a
  // fax line, a `Resources for You +` disclosure and a dead `Resources` pop-up
  // (its click opens an overlay with `destinationId: null`), another client's
  // logo, and a `right` block carrying a disclaimer paragraph and a second,
  // 10px copy of the TREC links. The rights line is in that hidden block too —
  // it IS rendered here, from the owner/year mechanism this component already
  // had, in the right column's free space (the left column sets the band's
  // height, so at `lg` it costs nothing).
  //
  // TWO THINGS THAT ARE NOT THE COMP'S
  //
  // - The list of pages is the MENU's (`footerNav` in site-config), not the
  //   comp's two labels. `#footer-nav` is where the bar's menu trigger sends a
  //   visitor whose script never arrived (issue #19), so it offers what the
  //   menu would have — and the site keeps one list of its pages.
  // - The ZIP. The comp prints "7825"; see $lib/office.
  //
  // THE FOOTER'S DUTY TO THE PINNED PHOTO BAND. On the homepage the band above
  // this one pins and the footer slides over it (it is later in the comp's
  // z-order and scrolls normally). That band is the last thing in <main> and
  // this is outside <main>, so the band has no room to stick unless it is
  // given exactly one footer-height of travel. The footer therefore publishes
  // its own border-box height as `--footer-h` on <html>, and is `relative
  // z-10` so it paints over what it slides across. Its one reader is the
  // `[data-pinned-band]` block in app.css; without script the property is
  // simply unset, and a reader must fall back to 0 — that one does.
  import BrandButton from "$lib/components/BrandButton.svelte";
  import { OFFICE, officeAddressLines } from "$lib/office";
  import { SITE_NAME } from "$lib/seo";
  import { FOOTER_NAV_ID, type FooterLink } from "$lib/site-config";

  interface Props {
    /** The closing call to action: one string per drawn line, then its
     *  buttons. Left out, the footer opens on the wordmark block. */
    cta?: { heading: string[]; links: FooterLink[] };
    /** The pages listed in `<nav id="footer-nav">`. */
    nav?: FooterLink[];
    /** The Texas Real Estate Commission links, labelled exactly as given. */
    legal?: FooterLink[];
    /** The garnet-and-dust wordmark; links home. */
    logo?: { url: string; alt?: string };
    /** "fade": the Homepage's ground at 1440 — off-white grading to sand, under
     *  the photo band. Everything else in the comp (Properties at every width,
     *  and the Homepage itself at 1280 and 390) is flat sand, the default. A
     *  route claims it with `footerGround` in its page data. */
    ground?: "fade";
    /** The current pathname, for `aria-current` in the list of pages. */
    currentPath?: string;
    /** Who holds the copyright, e.g. "Roalson Interests". The year is supplied
     *  at render, so it cannot go stale. This is the prop a site should set. */
    owner?: string;
    /** The WHOLE rights line, verbatim. Use this only when the line is not of
     *  the form "© <year> <owner>" — it freezes whatever year it contains, and
     *  a copyright line that silently goes stale every January is worse than
     *  none. Prefer `owner`. */
    text?: string;
  }

  let { cta, nav = [], legal = [], logo, ground, currentPath = "", owner, text }: Props = $props();

  // No placeholder: the template printed "Company Name" when neither was set,
  // which on a client's site is a wrong legal line rather than a visible TODO.
  const rights = $derived(text ?? (owner ? `© ${new Date().getFullYear()} ${owner}` : undefined));

  // Only http(s) links open in a new tab — the TREC documents are PDFs on
  // another origin. Site paths, tel: and mailto: stay in this one.
  const isExternal = (href: string) => /^https?:\/\//i.test(href);
  const linkAttrs = (href: string) => ({
    href,
    target: isExternal(href) ? "_blank" : undefined,
    rel: isExternal(href) ? "noopener noreferrer" : undefined,
  });

  const isCurrent = (href: string) =>
    href !== "" && (href === "/" ? currentPath === "/" : currentPath === href);

  let footerEl = $state<HTMLElement>();

  // Publish the footer's height — see the header. Fractional on purpose: the
  // band measures 512.56px at 1440 (the wordmark is 46.56 tall), and a rounded
  // value would leave the reader's spacer half a pixel taller than the footer
  // laid over it — a hairline of page ground under the last band.
  $effect(() => {
    const el = footerEl;
    if (!el) return;
    const root = document.documentElement;
    const write = (height: number) =>
      root.style.setProperty("--footer-h", `${Math.round(height * 100) / 100}px`);

    write(el.getBoundingClientRect().height);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver((entries) => {
            for (const entry of entries) {
              write(entry.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height);
            }
          });
    observer?.observe(el);

    return () => {
      observer?.disconnect();
      root.style.removeProperty("--footer-h");
    };
  });
</script>

<footer
  bind:this={footerEl}
  class="relative z-10 bg-light {ground === 'fade'
    ? 'lg:bg-gradient-to-b lg:from-background lg:to-light'
    : ''}"
>
  <!-- The site's gutters and its one two-column grid: the right column starts
       on x=513 at 1440, as on the listing page and in the menu. The comp's own
       footer columns are 413 | 20 | 846 — the same 513. -->
  <div class="mx-auto max-w-[1440px] px-5 py-[60px] sm:px-8 xl:px-20">
    <div class="lg:grid lg:grid-cols-[397fr_847fr] lg:gap-9">
      {#if cta}
        <div class="lg:col-start-2 lg:row-start-1">
          <!-- H1's size on an h2: it is the band's headline, not the page's.
               Still 66/80 at 390, as drawn (four lines there). Below 360 its
               longest line — "to serving", 294px in the comp and 297 as
               Chromium sets it — no longer fits the column, and the body clips
               overflow, so it steps down to H2 rather than lose a letter (WCAG
               1.4.10 asks for 320). `break-words` is for a fallback face wider
               than the real one: a broken word, never a clipped one. -->
          <h2 class="t-h1 max-[359px]:t-h2 break-words text-primary">
            <!-- One <br> per drawn break, with a real space after it: the comp
                 breaks the line with U+2028, which is not shipped, and a
                 reader that ignores the <br> must not get "forwardto". -->
            {#each cta.heading as line, i (i)}
              {#if i > 0}<br />{/if}
              {line}
            {/each}
          </h2>
          <!-- Wraps: the row is 286px as built (281 in the comp), and a 320px
               phone's column is 280. -->
          <div class="mt-10 flex flex-wrap gap-5">
            {#each cta.links as link, i (i)}
              <BrandButton href={link.href}>{link.label}</BrandButton>
            {/each}
          </div>
        </div>
      {/if}

      <div
        class="flex flex-col gap-20 lg:col-start-1 lg:row-start-1 {cta ? 'mt-[100px] lg:mt-0' : ''}"
      >
        {#if logo}
          <!-- 145 wide at every width — the BAR's wordmark drops to 93 on
               mobile, the footer's does not. Its dust "INTERESTS" is part of a
               logo and exempt from contrast (see app.css). -->
          <a href="/" class="block w-[145px]">
            <img
              src={logo.url}
              alt={logo.alt ?? SITE_NAME}
              width="383"
              height="123"
              class="block h-auto w-full"
            />
          </a>
        {/if}

        <div class="flex flex-col gap-5">
          {#if nav.length > 0}
            <!-- `Primary` is the bar's, so the two landmarks stay distinct. When
                 the menu trigger's fallback jumps here, `html`'s scroll padding
                 (app.css) is what clears the pinned bar — for every jump target
                 on the site, so this one carries no scroll margin of its own:
                 the two ADD, and it would land a bar too low. -->
            <nav id={FOOTER_NAV_ID} aria-label="Footer">
              <!-- The ramp class sits on the LIST so each row's line box is
                   H6's 18px; on the link alone the row keeps the body's taller
                   strut. Each link's hit area is grown to the full 38px pitch
                   by a pseudo-element, which moves nothing. -->
              <ul class="t-h6 flex flex-col gap-5 text-primary">
                {#each nav as link, i (i)}
                  <li>
                    <a
                      href={link.href}
                      aria-current={isCurrent(link.href) ? "page" : undefined}
                      class="relative inline-block after:absolute after:inset-x-0 after:-inset-y-[10px] hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                {/each}
              </ul>
            </nav>
          {/if}

          <div class="t-body-2 flex flex-col items-start gap-[10px] text-primary">
            <address class="not-italic">
              {#each officeAddressLines() as line, i (i)}
                {#if i > 0}<br />{/if}
                {line}
              {/each}
            </address>
            <!-- The WHOLE line is the link: a linked number trailing an unlinked
                 "Phone:" is a link distinguished from its sentence by nothing,
                 which is what axe's link-in-text-block reports. -->
            <a href={OFFICE.phone.href} class="hover:underline">Phone: {OFFICE.phone.display}</a>
            {#if legal.length > 0}
              <!-- The label text sits directly in the <a>: an underline does not
                   propagate into an inline-block, and app.css makes every
                   <span> one. -->
              <ul class="flex flex-col items-start gap-[10px]">
                {#each legal as link, i (i)}
                  <li class="max-w-[298px]">
                    <a {...linkAttrs(link.href)} class="underline hover:no-underline">
                      {link.label}{#if isExternal(link.href)}<span class="sr-only">
                          (opens in a new tab)</span
                        >{/if}
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      </div>

      {#if rights}
        <!-- The same grid cell as the headline, pinned to its foot: level with
             the last TREC line at `lg`, under the wordmark block on mobile. -->
        <p class="t-body-2 mt-10 text-primary lg:col-start-2 lg:row-start-1 lg:mt-0 lg:self-end">
          {rights}
        </p>
      {/if}
    </div>
  </div>
</footer>
