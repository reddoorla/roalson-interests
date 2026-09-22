<script lang="ts">
  import { PrismicPreview } from "@prismicio/svelte/kit";
  import { page } from "$app/state";
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { repositoryName } from "$lib/prismicio";
  import "../app.css";
  import Seo from "$lib/components/Seo.svelte";
  import {
    composeTitle,
    DEFAULT_OG_IMAGE,
    DEFAULT_OG_IMAGE_ALT,
    isNoindexPage,
    NOINDEX_ENFORCED,
  } from "$lib/seo";
  import TransitionOverlay from "$lib/components/TransitionOverlay.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { loadSiteConfig, footerNav } from "$lib/site-config";
  import { canvasTopStyleTag, canvasTopThemeColor } from "$lib/canvas-top";
  import { disableSmoothScroll, restoreSmoothScroll } from "$lib/utils/instantNavScroll";

  let { data, children } = $props();

  // The `:root` declaration for the ground above the document, or nothing. It
  // is markup rather than a <style> tag below because the compiler hoists a
  // literal one out of the head as this component's own stylesheet — see
  // $lib/canvas-top, which also owns the reason it is safe to {@html}.
  const canvasStyleTag = $derived(canvasTopStyleTag(page.data.canvasTop));

  // Site chrome from src/lib/site-config.json. A route speaks to it through
  // page data: `navOver` (what the bar sits on), `navWordmark` (whether the
  // bar's wordmark waits for the hero's cutout to leave — the homepage only)
  // and `footerGround` (what the footer's ground grades from).
  const siteConfig = loadSiteConfig();

  // Kit's own post-nav scroll (top / hash anchor / popstate restore) runs
  // instantly instead of gliding under app.css's smooth-scroll. See the util.
  beforeNavigate(disableSmoothScroll);
  afterNavigate(restoreSmoothScroll);
</script>

<!-- Single head source for the whole app. Static routes feed their title
     (and optional description/image) through `page.data`; per-page <svelte:head>
     title overrides would desync og:title, so pages set data, not tags. -->
<Seo
  title={composeTitle(page.data.meta_title || page.data.title)}
  description={page.data.meta_description}
  image={page.data.meta_image || DEFAULT_OG_IMAGE || undefined}
  imageAlt={page.data.meta_image_alt ?? (page.data.meta_image ? undefined : DEFAULT_OG_IMAGE_ALT)}
  url={page.url}
  noindex={NOINDEX_ENFORCED && isNoindexPage(page.url.pathname, page.data.noindex)}
  jsonLd={page.data.jsonLd}
/>
<a
  href="#main-content"
  class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-white focus:text-primary focus:px-4 focus:py-2 focus:rounded focus:shadow"
>
  Skip to main content
</a>
<!-- THE GROUND PAST THE TOP OF THE PAGE, and the browser's own toolbar tint.
     Both are the route's `canvasTop` claim; a route that claims nothing keeps
     the page ground.

     A RULE IN THE HEAD, NOT A STYLE ATTRIBUTE, because the thing being
     coloured is `html` itself (app.css: `background-color:
     var(--canvas-top, …)`) and a component cannot carry an attribute on its
     own root element. It is server-rendered, so the colour is right on the
     first paint and with scripting off — which the old element got right and
     is worth keeping.

     `theme-color` ships on EVERY route, including the ones that claim
     nothing. A route that omitted the tag would keep whatever the previous
     route set across a client-side navigation, so "no claim" has to be said
     out loud rather than left unsaid. -->
<svelte:head>
  <!-- WHY {@html}, AND WHY THE RULE BELOW IS TURNED OFF FOR ONE LINE.

       The value is not user content and not page data. It is the return of
       $lib/canvas-top's `canvasTopStyleTag`, which does a lookup on a frozen
       two-entry map and returns `undefined` for everything else; the token
       itself is never interpolated. That is not left to review either:
       canvas-top.test.ts feeds it every token, every non-token, `<script>`,
       a bare brace and a CSS-injection attempt, and asserts the set of
       distinct outputs is EXACTLY three values. An edit that started
       interpolating the token fails there, in milliseconds, with no browser.

       The obvious alternative is worse, not safer: a literal <style> written
       here is taken by the compiler as this component's OWN stylesheet and
       hoisted out of the markup, so it never reaches the document. Measured
       on a production build, 2026-09-22 — theme-color shipped correctly on
       all four routes and the rule was simply absent, leaving every page's
       canvas at the fallback. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {#if canvasStyleTag}{@html canvasStyleTag}{/if}
  <meta name="theme-color" content={canvasTopThemeColor(page.data.canvasTop)} />
</svelte:head>
<!-- Chrome renders from site-config; a route says what its first band is with
     `navOver`, and the homepage asks for the footer's graded ground with
     `footerGround`. -->
<div class="flex flex-col min-h-screen">
  <Nav
    items={siteConfig.nav.items}
    logo={siteConfig.nav.logo}
    cta={siteConfig.nav.cta}
    over={page.data.navOver}
    wordmark={page.data.navWordmark}
    currentPath={page.url.pathname}
  />

  <!-- The bar is out of flow (70px, 80 from `lg`), so <main> clears it — unless
       the route's first band is the dark one the bar floats over (`navOver`),
       which starts at y=0 as the comp draws it. -->
  <main
    id="main-content"
    tabindex="-1"
    class="flex-1 {page.data.navOver === 'dark' ? '' : 'pt-[70px] lg:pt-20'}"
  >
    {@render children?.()}
  </main>

  <Footer
    cta={siteConfig.footer.cta}
    nav={footerNav(siteConfig)}
    legal={siteConfig.footer.legal}
    logo={siteConfig.nav.logo}
    ground={page.data.footerGround}
    currentPath={page.url.pathname}
    owner={siteConfig.footer.owner}
    text={siteConfig.footer.text}
  />
</div>
<!-- THE GROUND PAST THE FOOT OF THE PAGE (`.canvas-foot` in app.css): zero
     height, and 100vh of the footer's sand painted below it as a box-shadow,
     which costs no scroll range in either axis. AFTER the wrapper, so it can
     never come between <main> and <footer> — the pinned photo band's rules in
     app.css are written on that adjacency. -->
<div class="canvas-foot" aria-hidden="true"></div>
<TransitionOverlay />
{#if data.isPreviewSession}
  <PrismicPreview {repositoryName} />
{/if}
