<script module lang="ts">
  // The comp's `button dark` component set (4840:367) as a link, with its
  // classes EXPORTED from this module script — `brandButtonBase`,
  // `BRAND_BUTTON_TONES`, `brandButtonPadding` — so a caller that must render a
  // different element, a form's submit `<button>`, can still wear it.
  // (That sentence is this file's whole row in docs/COMPONENTS.md:
  // scripts/capability-index.mjs keeps the FIRST sentence of this comment and
  // cannot see a `<script module>` export, so the names are in it or nowhere.
  // They were first written as the second sentence, and were nowhere.)
  //
  // Named, as Figma names it, for the BUTTON's tone, so it is the one for LIGHT
  // grounds: garnet outline and text; hover fills garnet with dust text
  // (5.11:1, AA as text).
  //
  // Its sibling `button light` (4840:372: dust outline and label, hover fills
  // dust with garnet text) is the "dust" tone — the navbar's CONTACT US while
  // the bar floats over a dark band. Dust is a fill-only token on LIGHT
  // grounds (1.97:1 on off-white), so "dust" is for dark grounds only; the nav
  // swaps to "garnet" the moment it takes its off-white ground.
  // (The garnet property card's button is "cream", below.)
  //
  // Not DefaultButton: that is the template's rounded, 2px-bordered, px-10
  // button, and this comp's is square, 1px, 40px tall, px-15, with an optional
  // arrow and a FILL on hover. DefaultButton is split so a caller can swap its
  // skin and keep its geometry — and the geometry is exactly what differs.
  //
  // THE EXPORTS follow DefaultButton's precedent, and exist because this
  // component is an <a> with a required href: the contact form's submit has to
  // be a <button type="submit">. They are literal strings, so Tailwind's
  // source scan still sees every class. Nav.test.ts reads `text-dust` /
  // `text-primary` off the CTA's resting classes and BrandButton.test.ts reads
  // the rest, so the rendered class list did not change when these strings
  // moved here — and BrandButton.test.ts now pins the exports to what the
  // component renders, so a class added to the markup beside them cannot reach
  // every link and miss the submit.

  /** Geometry and type. Carries no colour, and no padding — the arrow changes
   *  the padding (`brandButtonPadding`). */
  export const brandButtonBase =
    "t-h6 inline-flex h-10 items-center justify-center gap-[5px] border border-solid whitespace-nowrap transition-colors";

  /** "garnet" is the comp's `button dark` as drawn on a light ground. "cream"
   *  is the same button on the garnet property card (6904:2081): off-white
   *  outline and label, filling off-white with garnet text on hover —
   *  10.5:1 and 10.07:1. "dust" is the comp's `button light` for dark
   *  grounds: 5.11:1 on garnet, and garnet on the dust fill is the same pair
   *  inverted. Every tone is measured by theme-contrast.test.ts. */
  export const BRAND_BUTTON_TONES = {
    garnet: "border-primary text-primary hover:bg-primary hover:text-dust",
    cream: "border-background text-background hover:bg-background hover:text-primary",
    dust: "border-dust text-dust hover:bg-dust hover:text-primary",
  } as const;

  /** The comp's trailing arrow drops the right padding 15 → 10px, as in the
   *  LEARN MORE instances. */
  export const brandButtonPadding = (arrow: boolean) =>
    arrow ? "pr-[10px] pl-[15px]" : "px-[15px]";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import ArrowRight from "$lib/components/ArrowRight.svelte";

  interface Props extends Omit<HTMLAnchorAttributes, "class" | "children"> {
    href: string;
    /** The comp's trailing arrow; the button's right padding drops 15 → 10px
     *  with it, as in the LEARN MORE instances. */
    arrow?: boolean;
    /** See BRAND_BUTTON_TONES in the module script. */
    tone?: keyof typeof BRAND_BUTTON_TONES;
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
</script>

<a
  {href}
  {...rest}
  class="{brandButtonBase} {BRAND_BUTTON_TONES[tone]} {brandButtonPadding(arrow)} {passedClasses}"
>
  {@render children()}
  {#if arrow}<ArrowRight />{/if}
</a>
