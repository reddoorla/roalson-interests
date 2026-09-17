<script lang="ts">
  import RichTextBody from "$lib/components/RichTextBody.svelte";
  import ContentBand from "$lib/components/ContentBand.svelte";
  import {
    buttonBaseClasses,
    buttonSkinClasses,
    buttonSkinInverseClasses,
  } from "$lib/components/DefaultButton.svelte";
  import { PrismicLink } from "@prismicio/svelte";
  import { isFilled, type Content } from "@prismicio/client";

  type Props = { slice: Content.CtaBannerSlice };
  let { slice }: Props = $props();

  const background = $derived(slice.primary.background ?? "light");
  const onDark = $derived(background === "dark");

  // Full literal class strings so the Tailwind scanner keeps them. The palette
  // is the starter's placeholder theme (app.css `@theme`) — swap the tokens
  // per project, not the markup.
  const groundClass = $derived(
    (
      {
        light: "bg-light text-primary",
        dark: "bg-dark text-white",
        white: "bg-white text-primary",
      } as Record<string, string>
    )[background] ?? "bg-light text-primary",
  );

  const hasButton = $derived(
    isFilled.link(slice.primary.buttonLink) && !!slice.primary.buttonLabel,
  );
  // PrismicLink emits a plain <a> (with target/rel when the field asks for
  // them) wearing the shared button skin. Never a <button> inside a link —
  // that is axe's `nested-interactive` violation.
  const buttonClass = $derived(
    `${buttonBaseClasses} ${onDark ? buttonSkinInverseClasses : buttonSkinClasses} shrink-0`,
  );
</script>

<!-- A closing call-to-action band: one headline, one link. Deliberately
     unstyled beyond the theme tokens — the heading's size comes from the
     project's own h2 rule (app.css leaves the type scale blank), and
     RichTextBody keeps the announced level gap-free without touching the tag,
     so the visual never drifts from the outline. -->
<ContentBand
  sliceType={slice.slice_type}
  variation={slice.variation}
  sectionClass={groundClass}
  contentClass="flex max-w-5xl flex-col items-start gap-8 px-6 py-16 md:flex-row md:items-center md:justify-between"
>
  {#if isFilled.richText(slice.primary.heading)}
    <div class="max-w-2xl">
      <RichTextBody field={slice.primary.heading} />
    </div>
  {/if}

  {#if hasButton}
    <PrismicLink field={slice.primary.buttonLink} class={buttonClass}>
      {slice.primary.buttonLabel}
    </PrismicLink>
  {/if}
</ContentBand>
