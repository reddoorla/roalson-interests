<script lang="ts">
  import type { HTMLFormAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";
  import { reveal } from "$lib/utils/reveal";

  interface Props extends HTMLFormAttributes {
    errors?: Record<string, string>;
    errorSummaryTitle?: string;
    children?: Snippet;
  }

  let {
    errors,
    errorSummaryTitle = "There was a problem with your submission",
    children,
    ...rest
  }: Props = $props();

  const errorEntries = $derived(errors ? Object.entries(errors) : []);
  let summaryEl: HTMLDivElement | undefined = $state();

  // `reveal`, not `focus()`. The summary is the form's first row and the submit
  // its last, so it arrives while the glide that brought the button into view
  // may still be in flight — and a plain focus() then leaves it focused under
  // the pinned bar. /contact's alert was measured doing exactly that (top −8px
  // behind an 80px bar) and this was the precedent it had copied. `html`'s
  // scroll padding alone does not fix it: focus() scrolls nothing at all when
  // it finds the summary in view mid-glide.
  $effect(() => {
    if (errorEntries.length > 0) reveal(summaryEl);
  });
</script>

<form {...rest}>
  {#if errorEntries.length > 0}
    <div
      bind:this={summaryEl}
      tabindex="-1"
      role="alert"
      aria-labelledby="form-error-summary-title"
      class="mb-[30px] border border-error px-4 py-3"
    >
      <!-- Theme tokens only. This was Tailwind's default red — a 600 border, a
           50 fill, 900 text — which is outside the theme, so
           theme-contrast.test.ts measured none of it. (Spelled that way on
           purpose: Tailwind's source scan reads comments, and the three
           utilities written out whole here shipped as three dead rules.)
           `text-error` is 5.64:1
           on the page's off-white, 6.47 on white, 4.97 on sand. Square and
           1px, like Field and the comp's buttons; no fill, so it stands on
           whichever light ground the form does. -->
      <h2 id="form-error-summary-title" class="t-h6 text-error">
        {errorSummaryTitle}
      </h2>
      <ul class="t-body-2 mt-2.5 list-disc ps-[21px] text-error">
        {#each errorEntries as [field, message] (field)}
          <li>{message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {@render children?.()}
</form>
