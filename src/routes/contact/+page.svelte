<script lang="ts">
  import { enhance } from "$app/forms";
  import Field from "$lib/components/Field.svelte";
  import TurnstileWidget from "$lib/components/TurnstileWidget.svelte";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let message = $state("");
  let submitting = $state(false);

  /** Focused when the confirmation replaces the form. Without this, focus is
   *  left on a submit button that no longer exists, which drops it to <body> —
   *  a keyboard or screen-reader user is then sitting at the top of the
   *  document with no idea the request went through. */
  let confirmationEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (form?.success) confirmationEl?.focus();
  });
</script>

<!--
  Canonical contact form (clone skeleton). EDIT PER SITE:
  - the page title (in +page.server.ts's load → flows to the layout <Seo>),
    <h1>, and subhead copy below
  - the success-message copy
  - the field set (add/remove <Field>s + matching keys in +page.server.ts buildPayload)
  Forwards to the central dashboard ingest via createIngestAction; spam is handled
  by the hidden honeypot + a 2s fill-timing screen, plus optional Cloudflare Turnstile
  (set PUBLIC_TURNSTILE_SITE_KEY to enable — verified centrally by the dashboard).
  Requires FORMS_INGEST_URL + FORMS_INGEST_TOKEN in the deployed site's env (see .env.example).
-->

<main class="max-w-2xl mx-auto px-8 py-16 space-y-8">
  <header class="space-y-2">
    <h1 class="text-3xl font-bold">Contact us</h1>
    <p class="text-secondary">Send us a message and we'll get back to you.</p>
  </header>

  <!-- One-and-done: on success the form unmounts. To allow another submission, keep the form mounted and reset the field state instead. -->
  {#if form?.success}
    <!-- tabindex=-1 so the effect above can move focus here; role=status
         announces it to assistive tech without stealing the reading position
         from someone who is already elsewhere on the page. -->
    <p
      bind:this={confirmationEl}
      role="status"
      tabindex="-1"
      class="border-2 border-green-600 bg-green-50 rounded p-4 text-green-900"
    >
      Thanks — your message is on its way. We'll be in touch soon.
    </p>
  {:else}
    <form
      method="POST"
      class="space-y-4"
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
        <p role="alert" class="border-2 border-red-600 bg-red-50 rounded p-4 text-red-900">
          {form.error}
        </p>
      {/if}

      <!-- Anti-bot: per-request timing token + a hidden honeypot. Naive bots
           fill the honeypot; a too-fast fill is caught by the timing screen. -->
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
      <Field
        name="email"
        label="Email"
        type="email"
        autocomplete="email"
        required
        bind:value={email}
      />
      <Field name="phone" label="Phone" type="tel" autocomplete="tel" bind:value={phone} />
      <Field
        name="message"
        label="Message"
        type="textarea"
        maxlength={5000}
        required
        bind:value={message}
      />

      <!-- Optional Cloudflare Turnstile (dark until PUBLIC_TURNSTILE_SITE_KEY is
           set — the component gates itself). Mounted inside the form so the widget
           injects a hidden `cf-turnstile-response` input here, which
           createIngestAction reads and forwards. Verification is central (the
           dashboard holds TURNSTILE_SECRET_KEY; sites carry only the public key). -->
      <TurnstileWidget />

      <!-- The last click in the flow, and it used to acknowledge the wait by
           DIMMING itself: `disabled:opacity-60` composited the label against a
           faded button at the exact moment someone is waiting on it and
           deciding whether to click again — the least readable state on the
           page, during the only wait it has. The sending state now keeps label
           and background at full strength and says so instead: `aria-busy` so
           the change reaches a screen reader rather than only the accessible
           name silently mutating, and a wait cursor for everyone else. -->
      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        class="px-4 py-2 bg-primary text-white rounded bump disabled:cursor-wait"
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  {/if}
</main>
