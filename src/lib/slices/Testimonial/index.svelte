<script lang="ts">
  import ContentBand from "$lib/components/ContentBand.svelte";
  import { PrismicImage } from "@prismicio/svelte";
  import { isFilled, type Content, type ImageField } from "@prismicio/client";
  import { resolveAvatarAlt } from "./avatarAlt";

  type Props = { slice: Content.TestimonialSlice };
  let { slice }: Props = $props();

  const avatar = $derived(slice.primary.avatar);
  const hasAvatar = $derived(isFilled.image(avatar));
  // PrismicImage takes its alt off the field, so the name fallback is written
  // back onto the field rather than passed as a prop (see ./avatarAlt.ts).
  const avatarAlt = $derived(resolveAvatarAlt(avatar?.alt, slice.primary.name));
  const avatarField = $derived({ ...avatar, alt: avatarAlt } as ImageField);
  const hasCredit = $derived(Boolean(slice.primary.name || slice.primary.role || hasAvatar));
  // A filled avatar with nothing beside it naming the person is the one case
  // where the credit carries no text at all — give assistive tech the resolved
  // alt as visually-hidden text so the figure is never a bare, silent image.
  const needsSrName = $derived(
    hasAvatar && !slice.primary.name && !slice.primary.role && !!avatarAlt,
  );
</script>

<!-- An attributed pull quote. figure/blockquote/figcaption is the semantic
     pattern; the credited name is deliberately NOT a heading (it does not title
     a section, and marking it as one would both break the page outline and pick
     up whatever type scale the project defines for headings). The optional
     label DOES name the section, so it is the h2 — same call as LeadText. -->
<ContentBand
  sliceType={slice.slice_type}
  variation={slice.variation}
  contentClass="max-w-3xl px-6 py-10"
>
  {#if slice.primary.label}
    <h2 class="mb-3 text-sm font-semibold tracking-wide text-secondary uppercase">
      {slice.primary.label}
    </h2>
  {/if}

  {#if slice.primary.quote || hasCredit}
    <figure>
      {#if slice.primary.quote}
        <blockquote>
          <p class="quote text-lg leading-relaxed text-primary">
            {slice.primary.quote}
          </p>
        </blockquote>
      {/if}

      {#if hasCredit}
        <figcaption class="flex items-center gap-4 {slice.primary.quote ? 'mt-6' : ''}">
          {#if hasAvatar}
            <PrismicImage
              field={avatarField}
              fallbackAlt=""
              imgixParams={{ auto: ["format", "compress"] }}
              widths={[64, 128, 160, 320]}
              sizes="(min-width: 768px) 80px, 64px"
              loading="lazy"
              decoding="async"
              class="h-16 w-16 shrink-0 rounded-full object-cover md:h-20 md:w-20"
            />
          {/if}
          <div class="min-w-0">
            {#if slice.primary.name}
              <p class="font-semibold text-primary">{slice.primary.name}</p>
            {/if}
            {#if slice.primary.role}
              <p class="text-sm text-secondary">{slice.primary.role}</p>
            {/if}
            {#if needsSrName}
              <p class="sr-only">{avatarAlt}</p>
            {/if}
          </div>
        </figcaption>
      {/if}
    </figure>
  {/if}
</ContentBand>

<style>
  /* The curly marks are chrome, not content: the CMS stores the quote bare so
     every testimonial gets identical punctuation. The second `content`
     declaration adds the alternative-text form (`"…" / ""`), which marks the
     generated glyph decorative for screen readers; browsers that don't parse
     it keep the first declaration and still draw the mark. */
  .quote::before {
    content: "\201C";
    content: "\201C" / "";
  }
  .quote::after {
    content: "\201D";
    content: "\201D" / "";
  }
</style>
