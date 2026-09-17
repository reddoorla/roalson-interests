<script lang="ts">
  import { env } from "$env/dynamic/public";
  import { loadTurnstile } from "$lib/turnstile";

  // Optional Cloudflare Turnstile widget. Dark until PUBLIC_TURNSTILE_SITE_KEY
  // is set (trimmed so a stray-whitespace value stays dark). Rendered explicitly
  // so it works on full page load AND SvelteKit SPA nav — see $lib/turnstile for
  // why auto-render can't. When mounted inside a <form>, Turnstile injects its
  // hidden `cf-turnstile-response` input into that form automatically (the
  // contact form relies on this). For a widget living outside the submitted form
  // (e.g. mirroring into a hidden form), pass `onToken` to receive the token and
  // forward it yourself.
  let { onToken }: { onToken?: (token: string) => void } = $props();

  const turnstileSiteKey = env.PUBLIC_TURNSTILE_SITE_KEY?.trim();
  let turnstileEl = $state<HTMLDivElement>();

  $effect(() => {
    const el = turnstileEl;
    if (!turnstileSiteKey || !el) return;
    let widgetId: string | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        // api.js can resolve after this mount is already gone (SPA nav mid-load).
        if (cancelled || !el.isConnected) return;
        widgetId = turnstile.render(el, {
          sitekey: turnstileSiteKey,
          callback: (token: string) => onToken?.(token),
        });
      })
      .catch((err) => {
        // Offline / blocked / CSP / misconfigured sitekey: central ingest is
        // fail-open, so a missing token degrades to the honeypot + timing +
        // heuristic screen, never a dropped lead. Warn so an operator can still
        // triage "the widget isn't showing" instead of failing silently.
        console.warn("[turnstile] widget did not render:", err);
      });
    return () => {
      cancelled = true;
      // A token from a torn-down widget must not outlive it in parent state.
      onToken?.("");
      if (widgetId !== undefined) {
        try {
          window.turnstile?.remove(widgetId);
        } catch {
          // Widget already torn down (e.g. by navigation) — nothing to clean up.
        }
      }
    };
  });
</script>

{#if turnstileSiteKey}
  <!-- Mount point; the effect above renders the widget into it explicitly.
       `min-h-[65px]` reserves the iframe's box BEFORE api.js resolves. Without
       it the widget appears out of nothing at a moment nobody controls and
       shoves everything below it — on the contact form, the submit button —
       down ~65px, which is a layout shift landing exactly where someone is
       about to click. Scoped inside this `{#if}` on purpose: with no sitekey
       (dev, tests, the a11y gates) the component still renders nothing at all,
       so the reserved space costs only the environments that get a widget. -->
  <div class="cf-turnstile min-h-[65px]" bind:this={turnstileEl}></div>
{/if}
