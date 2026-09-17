<script module lang="ts">
  // Shape and skin of the shared button, split so callers that must render a
  // different element can still wear it. `PrismicLink` (used by the slices)
  // emits its own <a> with href/target/rel, so it can't be wrapped in this
  // component — it takes `buttonBaseClasses` and picks a skin instead.
  // Keep the two apart: a caller on a dark ground swaps ONLY the skin, and two
  // competing `border-*`/`hover:bg-*` sets in one class attribute would
  // resolve by stylesheet order, not by the order they were written.

  /** Geometry + micro-interaction; carries no colour. */
  export const buttonBaseClasses = "bump rounded border-2 border-solid px-10 pt-4 pb-3 h-fit";
  /** Default colour skin: outlined dark, inverting on hover. */
  export const buttonSkinClasses = "border-dark hover:bg-dark hover:text-white";
  /** Inverse skin for dark grounds. */
  export const buttonSkinInverseClasses = "border-white text-white hover:bg-white hover:text-dark";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  interface ButtonProps {
    href?: string;
    onclick?: (event: MouseEvent) => void;
    class?: string;
    children?: Snippet;
  }

  let {
    href = "",
    onclick = () => {},
    class: passedClasses = "",
    children = undefined,
  }: ButtonProps = $props();

  // `bump` supplies the transition (transform + hover colors) itself — do not
  // add Tailwind's `transition` utility alongside it: it emits later in the
  // built CSS and its longhands would override bump's timings.
  const baseClasses = `${buttonBaseClasses} ${buttonSkinClasses}`;
</script>

{#if href}
  <a {href} {onclick} class="{baseClasses} {passedClasses}">
    {@render children?.()}
  </a>
{:else}
  <button {onclick} class="{baseClasses} {passedClasses}">
    {@render children?.()}
  </button>
{/if}
