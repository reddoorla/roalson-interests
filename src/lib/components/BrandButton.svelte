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
  // grounds: garnet outline and text; hover fills garnet with SAND text
  // (8.87:1).
  //
  // Its sibling `button light` (4840:372) is the "light" tone — the navbar's
  // CONTACT US while the bar floats over a dark band.
  //
  // THE COMP DRAWS `button light` IN DUST AND THIS SITE DRAWS IT IN SAND.
  // Operator call, 2026-09-22: "use the tan as the light color for buttons
  // rather than the grey". It is a taste call and it needed no defending, but
  // it happens to be free: every pair it touches goes UP and none goes down.
  //
  //                    label + 1px outline        garnet on
  //                    on garnet   on #3d0707     the filled button
  //     dust (comp)      5.11:1       7.55:1          5.11:1
  //     sand  (ours)     8.87:1      13.09:1          8.87:1
  //
  // The tone is still for DARK grounds only — sand is 1.14:1 on the off-white
  // page — so the nav still swaps to "garnet" the moment it takes its
  // off-white ground. What changed is which light token the swap lands on.
  //
  // Dust did not leave the palette, it left the BUTTONS. It is still text on
  // garnet where the comp puts it: HomeHero's specialty line, the open menu's
  // "Menu" eyebrow and its sub-labels, the menu links' underline. After this
  // change dust is a fill NOWHERE — CarouselProgress had already refused it
  // (its track is 1.73:1 on sand), so `theme-contrast.test.ts`'s FILL_PAIRS
  // moved to sand with it.
  // (The garnet property card's button is "cream", below.)
  //
  // Not DefaultButton: that is the template's rounded, 2px-bordered, px-10
  // button, and this comp's is square, 1px, 40px tall, 15px of border-plus-
  // padding (see brandButtonPadding), with an optional arrow and a FILL on
  // hover. DefaultButton is split so a caller can swap its
  // skin and keep its geometry — and the geometry is exactly what differs.
  //
  // THE EXPORTS follow DefaultButton's precedent, and exist because this
  // component is an <a> with a required href: the contact form's submit has to
  // be a <button type="submit">. They are literal strings, so Tailwind's
  // source scan still sees every class. Nav.test.ts reads `text-light` /
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
   *  10.5:1 and 10.07:1. "light" is the comp's `button light` for dark
   *  grounds, in SAND rather than the comp's dust: 8.87:1 on garnet and
   *  13.09:1 on #3d0707, with garnet on the sand fill the same pair inverted.
   *  Every tone is measured by theme-contrast.test.ts. */
  export const BRAND_BUTTON_TONES = {
    garnet: "border-primary text-primary hover:bg-primary hover:text-light",
    cream: "border-background text-background hover:bg-background hover:text-primary",
    light: "border-light text-light hover:bg-light hover:text-primary",
  } as const;

  /** The comp's trailing arrow drops the right padding 15 → 10px, as in the
   *  LEARN MORE instances.
   *
   *  14 and 9, not the comp's 15 and 10, and that is the fix for #26 rather
   *  than a departure from it: **Figma strokes a frame's border INSIDE its
   *  box and CSS draws it outside the padding.** A 117-wide comp button is 15
   *  + label + 15 with the 1px stroke eating into that; ours was 1 + 15 +
   *  label + 15 + 1, so every button on the site was 2px wider than drawn (120
   *  against 117, 146.45 against 143). Taking the border's pixel out of the
   *  padding puts border + padding back at the comp's 15 and the whole button
   *  back on its number. Measured on every consumer, not just the one that
   *  found it. */
  export const brandButtonPadding = (arrow: boolean) =>
    arrow ? "pr-[9px] pl-[14px]" : "px-[14px]";
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
