<script lang="ts">
  import type { HTMLFormAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";

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

  $effect(() => {
    if (errorEntries.length > 0) {
      summaryEl?.focus();
    }
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
      <!-- Theme tokens only. This was `border-red-600 bg-red-50 text-red-900`:
           Tailwind's default palette, outside the theme, so
           theme-contrast.test.ts measured none of it. `text-error` is 5.64:1
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
