<script lang="ts">
  // The comp's `button dark` component set (4840:367) — named, as Figma names
  // it, for the BUTTON's tone, so it is the one for LIGHT grounds: garnet
  // outline and text; hover fills garnet with dust text (5.11:1, AA as text).
  //
  // Its sibling `button light` (4840:372: dust outline, hover fills dust with
  // garnet) is NOT here yet. Nothing renders it, and its hover puts text on a
  // dust ground the contrast guard does not measure — add it with its first
  // dark-ground use, and teach theme-contrast.test.ts that pair at the same time.
  // (The garnet property card's cream override is the card's business, via
  // `class`.)
  //
  // Not DefaultButton: that is the template's rounded, 2px-bordered, px-10
  // button, and this comp's is square, 1px, 40px tall, px-15, with an optional
  // arrow and a FILL on hover. DefaultButton is split so a caller can swap its
  // skin and keep its geometry — and the geometry is exactly what differs.
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import ArrowRight from "$lib/components/ArrowRight.svelte";

  interface Props extends Omit<HTMLAnchorAttributes, "class" | "children"> {
    href: string;
    /** The comp's trailing arrow; the button's right padding drops 15 → 10px
     *  with it, as in the LEARN MORE instances. */
    arrow?: boolean;
    /** "garnet" is the comp's `button dark` as drawn on a light ground. "cream"
     *  is the same button on the garnet property card (6904:2081): off-white
     *  outline and label, filling off-white with garnet text on hover —
     *  10.5:1 and 10.07:1. Both tones are measured by theme-contrast.test.ts. */
    tone?: "garnet" | "cream";
    class?: string;
    children: Snippet;
  }

  let {
    href,
    arrow = false,
    tone = "garnet",
    class: passedClasses = "",
    children,
    ...rest
  }: Props = $props();

  const TONES = {
    garnet: "border-primary text-primary hover:bg-primary hover:text-dust",
    cream: "border-background text-background hover:bg-background hover:text-primary",
  } as const;
</script>

<a
  {href}
  {...rest}
  class="t-h6 inline-flex h-10 items-center justify-center gap-[5px] border border-solid
    whitespace-nowrap transition-colors {TONES[tone]} {arrow
    ? 'pr-[10px] pl-[15px]'
    : 'px-[15px]'} {passedClasses}"
>
  {@render children()}
  {#if arrow}<ArrowRight />{/if}
</a>
