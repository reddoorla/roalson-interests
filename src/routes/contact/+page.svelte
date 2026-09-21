<script lang="ts">
  import { enhance } from "$app/forms";
  import ArrowRight from "$lib/components/ArrowRight.svelte";
  import BrandButton, {
    BRAND_BUTTON_TONES,
    brandButtonBase,
    brandButtonPadding,
  } from "$lib/components/BrandButton.svelte";
  import Field from "$lib/components/Field.svelte";
  import PageMasthead from "$lib/components/PageMasthead.svelte";
  import TurnstileWidget from "$lib/components/TurnstileWidget.svelte";
  import { OFFICE, officeAddressLines, officeDirectionsUrl } from "$lib/office";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let message = $state("");
  let submitting = $state(false);

  /** Put focus on a panel script has just rendered, and put the panel in view.
   *
   *  Two calls, because `focus()`'s own scroll is "only if needed", decided at
   *  the instant of the call — and `html` is `scroll-behavior: smooth`. Tab to
   *  the submit and press Enter, and the glide that brought the button into
   *  view is still in flight when the answer arrives: the alert IS in view at
   *  that instant, so focus() scrolls nothing, and the glide then finishes with
   *  the alert under the pinned bar. Measured at 1440×900 on the dev server:
   *  alert top at −8px behind an 80px bar, focused and invisible.
   *  `scrollIntoView` replaces the scroll in flight, and honours `html`'s
   *  `scroll-padding-top` (app.css), so it lands 20px under the bar every time.
   *  Optional call: jsdom has no scrollIntoView. */
  function reveal(el: HTMLElement | null) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "start" });
  }

  /** Focused when the confirmation replaces the form. Without this, focus is
   *  left on a submit button that no longer exists, which drops it to <body> —
   *  a keyboard or screen-reader user is then sitting at the top of the
   *  document with no idea the request went through. */
  let confirmationEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (form?.success) reveal(confirmationEl);
  });

  /** The same, for a failure. The alert is the form's FIRST row and the submit
   *  its last, 518px further down at 1440 and 648 at 390: a failed send
   *  left the visitor on the button with the explanation off-screen above
   *  them. Form.svelte's summary has always done this; the page's single
   *  top-level error had not. */
  let errorEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (form?.error) reveal(errorEl);
  });

  // Both of those are focus TARGETS: script puts focus there, a keyboard cannot
  // (`tabindex="-1"`), so app.css's focus floor — which is written for things a
  // keyboard reaches — leaves them to the UA's ring. This is the floor's own
  // declaration, ground-following variable and all, rather than a colour
  // picked here. WHERE `reveal` lands them — 20px under the pinned bar — is not
  // said here: it is `html`'s scroll padding in app.css, which covers every
  // control the browser scrolls to as well. A scroll margin on these would ADD
  // to it and land them a bar too low.
  const FOCUS_TARGET =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring,var(--color-primary))]";

  // The Properties page's section divider (PropertyListing.svelte, comp
  // 6909:1940), unchanged: a 2px garnet rule, the H3 label 18px under it (the
  // comp's 20 — Figma strokes the rule INSIDE the frame), and NO bottom
  // padding, so `t-h3`'s −9.4px bottom margin collapses through onto the
  // `pt-10` block that follows and lands content 40px under the label's
  // baseline. A flex or grid parent between the two would stop that collapse.
  const DIVIDER = "border-t-2 border-primary pt-[18px]";
</script>

<!--
  The contact page. No comp exists for it at any width — it is designed FROM the
  system: the Properties masthead, the site's one 397/847 grid, the listing
  page's section divider, `button dark`, and PropertyDetail's label/value pair.

  What this page may NOT change, because other systems read it:
  - `method="POST"`, the `use:enhance` callback, the hidden `ts` input and the
    honeypot below, verbatim; the field `name`s; native `required` /
    `type="email"` (createIngestAction validates NO field, so never add
    `novalidate`); <TurnstileWidget /> INSIDE the <form>.
  - Spam is handled by the hidden honeypot + a fill-timing screen (`MIN_FILL_MS`
    in the shared package — 800 ms at 0.96.0), plus optional Cloudflare Turnstile
    (set PUBLIC_TURNSTILE_SITE_KEY to enable — verified centrally by the
    dashboard). A screened-out submission answers `{ success: true }` on
    purpose, so the confirmation panel is NOT evidence that a lead was delivered.
  - Requires FORMS_INGEST_URL + FORMS_INGEST_TOKEN in the deployed site's env
    (see .env.example); without them the action answers 500 with the
    "temporarily unavailable" copy in +page.server.ts.

  <PageMasthead> must stay the FIRST tag: src/routes/nav-over.test.ts reads the
  first tag after the script and comments to check the route's `navOver: "dark"`
  claim. A {#snippet} declared above it would become "the first band".

  No second <main>: the layout owns main#main-content.
-->

<PageMasthead title="Contact Us" />

<div class="mx-auto max-w-[1440px] px-5 pt-10 pb-[100px] text-primary sm:px-8 xl:px-20">
  <!-- Two dividers, one per column, rather than one full-width rule: both
       columns need a heading (the office block a label, the form an accessible
       name), and stacked below `lg` this IS the Properties page's mobile
       rhythm — divider, block, 40, divider, block. The office comes first in
       the DOM and on a phone: an address and a tap-to-call number are ~250px
       tall and are what a phone visitor most often came for. -->
  <div class="flex flex-col gap-10 lg:grid lg:grid-cols-[397fr_847fr] lg:items-start lg:gap-9">
    <section aria-labelledby="contact-office">
      <div class={DIVIDER}>
        <h2 id="contact-office" class="t-h3 text-primary">Our Office</h2>
      </div>
      <div class="flex flex-col items-start pt-10">
        <!-- dt.t-h5 over dd.t-body-1, 15 apart: PropertyDetail's label/value
             pair. Body 1, not the footer's Body 2 — page scale, as the property
             page scales up the card. -->
        <dl class="flex flex-col gap-[30px]">
          <div class="flex flex-col gap-[15px]">
            <dt class="t-h5 text-secondary">Address</dt>
            <dd class="t-body-1">
              <address class="not-italic">
                {#each officeAddressLines() as line, i (i)}
                  {#if i > 0}<br />{/if}
                  {line}
                {/each}
              </address>
            </dd>
          </div>
          <div class="flex flex-col gap-[15px]">
            <dt class="t-h5 text-secondary">Phone</dt>
            <dd class="t-body-1">
              <!-- inline-block so the target is the 24px line, not the ~19px
                   glyph box (WCAG 2.5.8). -->
              <a
                href={OFFICE.phone.href}
                class="inline-block underline underline-offset-4 hover:no-underline"
              >
                {OFFICE.phone.display}
              </a>
            </dd>
          </div>
        </dl>
        <!-- A plain Maps link: no key, no script, no CSP host. -->
        <BrandButton
          href={officeDirectionsUrl()}
          arrow
          target="_blank"
          rel="noopener noreferrer"
          class="mt-10"
        >
          Get directions
          <span class="sr-only">(opens in a new tab)</span>
        </BrandButton>
      </div>
    </section>

    <!-- The SECTION carries the accessible name, not the <form>: naming both
         nests a `form` landmark inside a `region` of the same name, and the
         section outlives the form on success. It is also the fragment the form
         posts to — see `action` below — and it lands clear of the bar by
         `html`'s scroll padding (app.css), with no margin of its own. -->
    <section id="contact-form" aria-labelledby="contact-form-heading">
      <div class={DIVIDER}>
        <h2 id="contact-form-heading" class="t-h3 text-primary">Send Us a Message</h2>
      </div>
      <div class="pt-10">
        <!-- One-and-done: on success the form unmounts. To allow another submission, keep the form mounted and reset the field state instead. -->
        {#if form?.success}
          <!-- tabindex=-1 so the effect above can move focus here; role=status
               announces it to assistive tech without stealing the reading
               position from someone who is already elsewhere on the page. -->
          <div
            bind:this={confirmationEl}
            role="status"
            tabindex="-1"
            class="bg-light px-5 py-10 text-primary lg:px-10 {FOCUS_TARGET}"
          >
            <p class="t-h3">Thank you — your message is on its way.</p>
            <p class="t-body-1 mt-5">
              We'll be in touch soon. If it can't wait, call
              <a
                href={OFFICE.phone.href}
                class="inline-block underline underline-offset-4 hover:no-underline"
                >{OFFICE.phone.display}</a
              >.
            </p>
          </div>
        {:else}
          <p class="t-body-1">Send us a message and we'll get back to you.</p>
          <p class="t-body-2 mt-2.5 text-secondary">
            Fields marked <span class="text-error" aria-hidden="true">*</span><span class="sr-only"
              >with an asterisk</span
            > are required.
          </p>
          <!-- `action` is a bare fragment, which keeps the path AND the query
               (so `sourceUrl` still carries UTM params) and adds only where to
               land: without script the POST's response loads at the top of the
               document, and the form section starts a screen or more down on a
               phone — the confirmation or the alert would be below the fold.
               `enhance` fetches `form.action`, and fetch drops fragments. -->
          <form
            method="POST"
            action="#contact-form"
            class="mt-[30px] flex flex-col gap-[30px]"
            use:enhance={() => {
              submitting = true;
              return async ({ update }) => {
                await update();
                submitting = false;
              };
            }}
          >
            <!-- Single top-level error; for multi-field validation summaries see $lib/components/Form.svelte. -->
            {#if form?.error}
              <p
                bind:this={errorEl}
                role="alert"
                tabindex="-1"
                class="t-body-1 border border-error px-4 py-3 text-error {FOCUS_TARGET}"
              >
                {form.error}
              </p>
            {/if}

            <!-- Anti-bot: per-request timing token + a hidden honeypot. Naive bots
                 fill the honeypot; a too-fast fill is caught by the timing screen.
                 Both are `display: none`, so neither is a flex item and neither
                 costs a 30px gap. -->
            <input type="hidden" name="ts" value={data.formTs} />
            <input
              type="text"
              name="bot-field"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
              class="hidden"
            />

            <Field name="name" label="Name" autocomplete="name" required bind:value={name} />
            <div class="grid gap-x-5 gap-y-[30px] sm:grid-cols-2">
              <Field
                name="email"
                label="Email"
                type="email"
                autocomplete="email"
                required
                bind:value={email}
              />
              <Field name="phone" label="Phone" type="tel" autocomplete="tel" bind:value={phone} />
            </div>
            <Field
              name="message"
              label="Message"
              type="textarea"
              rows={6}
              maxlength={5000}
              required
              bind:value={message}
            />

            <!-- Optional Cloudflare Turnstile (dark until PUBLIC_TURNSTILE_SITE_KEY is
                 set — the component gates itself). Mounted inside the form so the widget
                 injects a hidden `cf-turnstile-response` input here, which
                 createIngestAction reads and forwards. Verification is central (the
                 dashboard holds TURNSTILE_SECRET_KEY; sites carry only the public key).
                 NOT wrapped: with no sitekey it renders nothing, and an empty
                 wrapper would be a flex item costing a dead 30px gap. -->
            <TurnstileWidget />

            <!-- A <button> wearing BrandButton (which is an <a>) through its
                 module exports. Outlined at rest, as every button in the comp
                 is. The sending state keeps label and ground at full strength
                 — it used to DIM itself (`disabled:opacity-60`) at the exact
                 moment someone is waiting on it and deciding whether to click
                 again — and says so instead: `aria-busy` so the change reaches
                 a screen reader rather than only the accessible name silently
                 mutating, and a wait cursor for everyone else. No `bump`:
                 app.css forbids it beside a `transition-*` utility. -->
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              class="{brandButtonBase} {BRAND_BUTTON_TONES.garnet} {brandButtonPadding(
                true,
              )} self-start disabled:cursor-wait"
            >
              {submitting ? "Sending…" : "Send message"}
              <ArrowRight />
            </button>
          </form>
        {/if}
      </div>
    </section>
  </div>
</div>
