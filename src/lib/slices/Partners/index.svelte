<script lang="ts">
  // The homepage's "Our Legacy" band — the comp's second `Value Prop #1`
  // (6802:1472 at 1440, 6994:829 at 390): on the page's off-white ground, an
  // eyebrow and a hairline over the PARTNER CARDS on the left, a headline and
  // body copy on the right. On a phone the cards come first.
  //
  // DOM ORDER IS THE PHONE'S, AND THE DESKTOP'S: cards, then text. The grid's
  // auto-placement puts the first child in the left column, so no `order-*`
  // is used at any width and focus order is reading order everywhere. The
  // price is that the band's <h2> FOLLOWS the cards, so a partner's name is a
  // <p> wearing `t-h3`, never an <h3>: a heading belongs to the heading BEFORE
  // it, and an h3 here would file both partners under the previous band's h2.
  // Nothing but Partners.test.ts holds that. axe does NOT — tried: with the
  // names as h3s its heading-order passes on /dev/home, because an h2 comes
  // first (the hero's "Our specialty" then; the featured band's own h2 since
  // the revised hero dropped that list) and h2 → h3 skips nothing. (The scout's
  // alternative — text first in the DOM and `order-first` on the cards below
  // `lg` — keeps the h3s, and breaks focus order on a phone the day an editor
  // puts a link in the body or fills the optional buttons: the cards are drawn
  // first and tabbed to last.)
  //
  // WHAT THE COMP DRAWS AND THIS DOES NOT:
  // - Both headshots are placeholders (a fishing snapshot and a studio shot
  //   of unknown licence — inventory §11, #3). None ships. The Person's
  //   `photo` is the field a real one goes in; EMPTY, the card has no photo box
  //   at all and the sand panel takes the full card width, which is the call
  //   PropertyCard already made for a listing with no photo. The card keeps
  //   the comp's 153px height either way, so the band stays 551 tall at 1440
  //   (the comp's 556 less the 2026-10-01 MarkUp trim).
  // - The founder's garnet row (6822:457) is HIDDEN at every width. Not built.
  // - No buttons are drawn under the body. `buttons` is modelled because the
  //   batch asked for it, and renders nothing while it is empty.
  //
  // EACH CARD IS A PERSON DOCUMENT (#179): the row links the partner's
  // `person` and the name, role, headshot and email are that document's, so
  // they are edited in one place ($lib/partners says how they arrive). A row
  // whose Person is unset, unpublished or arrived bare draws no card. PROFILE
  // links the Person's page, /team/<uid> (F4, operator 2026-09-28). CONTACT
  // opens a message to the Person's email (decision D3); the row's
  // `contact_link` overrides it, and /contact is the fallback when neither is
  // set. The slice simulator draws no cards: Slice Machine's mocks hold a
  // relationship as a bare id, the same limit FeaturedProperties documents.
  //
  // Declined, having read them: `ArrowRight` — the buttons' 25px arrow; the
  // text links carry a different glyph, exported as TextLinkArrow.
  // `PrismicLink` drops a document link's href on this routes-free client
  // (#10), so both links are plain <a>s over $lib/cms-href.
  import { asText, isFilled, type Content } from "@prismicio/client";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import RichTextBody from "$lib/components/RichTextBody.svelte";
  import TextLinkArrow from "$lib/components/TextLinkArrow.svelte";
  import { cmsHref } from "$lib/cms-href";
  import { partnerCards } from "$lib/partners";
  import { linkResolver } from "$lib/prismicio";
  import { ABOUT_ID } from "$lib/site-config";
  import { imgix, srcset } from "$lib/utils/image";

  let { slice }: { slice: Content.PartnersSlice } = $props();

  const uid = $props.id();

  // The site's gutters and its ONE two-column grid (ruling C3): the right
  // column starts at x=513 on every band. This band is drawn 371 | 63 | 846
  // with its text at x=514 — the comp is 1px inconsistent between its own
  // bands — so the grid stays the site's and the LEFT column's content is
  // capped at the comp's 371 instead.
  const GUTTERS = "mx-auto max-w-[1440px] px-5 sm:px-8 xl:px-20";

  /** The headshot box is 153 CSS px at every width: 1×, 2× and 3×. */
  const PHOTO_WIDTHS = [153, 306, 459];

  const primary = $derived(slice.primary);
  const eyebrow = $derived(primary.eyebrow?.trim() ?? "");
  const heading = $derived(asText(primary.heading ?? []).trim());
  const body = $derived(isFilled.richText(primary.body) ? primary.body : undefined);

  // A card needs a live Person with a name. Everything else on it is optional.
  const roster = $derived(partnerCards(primary.partners));
  const partners = $derived(roster.cards);

  // The same contract as HomeHero's: a label AND somewhere to go, first two.
  const buttons = $derived(
    (primary.buttons ?? [])
      .flatMap((button) => {
        const text = button.label?.trim() ?? "";
        const href = cmsHref(button.link, { linkResolver });
        if (text === "" || href === null) return [];
        const blank = "target" in button.link && button.link.target === "_blank";
        return [{ text, href, blank }];
      })
      .slice(0, 2),
  );

  const hasText = $derived(heading !== "" || body !== undefined || buttons.length > 0);

  // One text link: an 8px cap box in the comp, which is a third of WCAG 2.5.8's
  // 24px target. The padding makes the box 24 tall and the equal negative
  // margin gives the 16 back, so the glyphs stay on the comp's grid. The ramp
  // class sits on an INNER element: `t-h5` sets its own margin-block (the cap
  // trim), and on the padded element the two would fight over one property.
  const LINK = "group/link -my-2 block py-2 text-dark";
  const LINK_ROW = "flex items-start gap-[5px]";
  // `text-decoration` does not propagate into an inline-block, and app.css
  // makes every <span> one — so the underline is set on the span itself.
  const LINK_TEXT = "t-h5 group-hover/link:underline group-focus-visible/link:underline";
</script>

<!-- The counts are for View Source: "no card because the Person is
     unpublished" and "no card because the API sent it bare" look the same on
     the page. -->
<section
  id={ABOUT_ID}
  data-slice-type={slice.slice_type}
  data-slice-variation={slice.variation}
  data-partners-linked={roster.linked}
  data-partners-shown={partners.length}
  data-partners-unembedded={roster.unembedded}
  aria-labelledby={heading ? `${uid}-heading` : undefined}
  class="bg-background"
>
  <!-- 80 above and below at both widths (pad 80/80 at 1440, 80/20 at 390). -->
  <div class="{GUTTERS} py-20">
    <!-- 60 between the two blocks on a phone (6994:830); the site's grid from
         `lg`, where the LEFT column sets the band's height (396 against the
         text's 353). -->
    <div class="flex flex-col gap-[60px] lg:grid lg:grid-cols-[397fr_847fr] lg:gap-9">
      {#if eyebrow || partners.length > 0}
        <!-- The comp's 371 cap from `sm` up (#54). The comp draws the card
             350 at 390 and 371 at 1440 and nothing between; capped only from
             `lg`, a tablet drew it 704 wide at 768 and 959 at 1023, small type
             at the left of a wide sand slab. A phone's column is already
             narrower than the cap. -->
        <div class="sm:max-w-[371px]">
          {#if eyebrow}
            <!-- A <p>, not a heading (ruling G11a): the band's h2 is the
                 headline. H4, the featured band's "FEATURED PROPERTIES" size
                 (MarkUp, 2026-10-01: "same style as FEATURED PROPERTIES"); it
                 was H5 under approved call 2. The space over the rule is 29
                 and under it 27, the 32 and 30 the comp's rhythm gave less
                 10% (same round): the rule 38 below the eyebrow's cap top and
                 the first card 65 below it. -->
            <p id="{uid}-eyebrow" class="t-h4 text-primary">{eyebrow}</p>
          {/if}
          {#if partners.length > 0}
            <!-- The rule is the comp's 0.5px garnet stroke (6820:120), and it
                 is not a border: Chromium snaps a 0.5px BORDER up to a whole
                 pixel (measured on HomeHero's specialty rules, at 1x and an
                 emulated 2x, before the revised hero dropped that list on
                 2026-09-28 — this is the site's only half-pixel rule now),
                 and a 1px box scaled to half paints what Figma paints — AT 2x
                 AND ABOVE. At 1x the scaled box is one full device row of
                 solid garnet, heavier than Figma's own 1x render, which is a
                 50% blend. So up to 1.5dppx the box is NOT scaled and paints
                 garnet at half alpha instead: one device row of the blend
                 (#53). `-mb-px` gives its one pixel back, so like the comp's
                 zero-height line it takes no room and the 27 under it stays
                 27. It is the column's width — the comp's 374 in a 371 column
                 is 3px of drift from the band above.

                 An ELEMENT, where HomeHero's was a `before:` on its list — and
                 not for taste. axe's color-contrast refuses to measure text
                 when an ANCESTOR carries a pseudo-element a quarter of the
                 text's own area, and a 371 × 1 rule is nearly half of a
                 56 × 14 "PROFILE": all three links came back "needs review",
                 which the gate does not fail on and nobody reads. -->
            <div
              data-partners-rule
              aria-hidden="true"
              class="-mb-px h-px origin-top scale-y-50 bg-primary
                [@media(max-resolution:1.5dppx)]:scale-y-100
                [@media(max-resolution:1.5dppx)]:bg-primary/50 {eyebrow ? 'mt-[29px]' : ''}"
            ></div>
            <ul
              data-partners-list
              aria-labelledby={eyebrow ? `${uid}-eyebrow` : undefined}
              class="flex flex-col gap-5 pt-[27px]"
            >
              <!-- Index-keyed: nothing on a row is unique by contract. -->
              {#each partners as partner, i (i)}
                <li data-partner>
                  <!-- 153 tall with or without the photo: the comp's row is
                       the headshot's height, and the panel's own content
                       (30 + 16 + 20 + 9 + 30 + 8 + 30) is 143. -->
                  <div class="flex min-h-[153px]">
                    {#if partner.photo}
                      <!-- The frame's own fill shows while the photo loads.
                           alt="" unless the editor wrote one: the name is the
                           next thing in the card. -->
                      <!-- 153 wide and AT LEAST 153 tall, stretched to the row:
                           a fixed 153 square left an L-shaped card — a notch of
                           band ground under the photo — wherever the panel
                           beside it grew (the name or the links wrapping:
                           1024–1156 and 375 and below, up to 48.9px). -->
                      <div
                        data-partner-photo
                        class="min-h-[153px] w-[153px] shrink-0 self-stretch overflow-hidden bg-dark"
                      >
                        <img
                          src={imgix(partner.photo.url, { w: PHOTO_WIDTHS[1] })}
                          srcset={srcset(partner.photo.url, PHOTO_WIDTHS)}
                          sizes="153px"
                          width={partner.photo.dimensions?.width}
                          height={partner.photo.dimensions?.height}
                          alt={partner.photo.alt ?? ""}
                          loading="lazy"
                          decoding="async"
                          class="size-full object-cover"
                        />
                      </div>
                    {/if}
                    <!-- The comp's `info`: pad 30/15, name and role 20 apart,
                         the links 30 under them. Every gap is between CAP
                         boxes; the ramp's negative margins make that so. -->
                    <div
                      class="flex min-w-0 flex-1 flex-col gap-[30px] bg-light px-[15px] py-[30px]"
                    >
                      <div class="flex flex-col gap-5">
                        <p class="t-h3 text-dark">{partner.name}</p>
                        {#if partner.role}
                          <p class="t-h4 text-dark">{partner.role}</p>
                        {/if}
                      </div>
                      <!-- At 390 the comp's row is 167.8 wide in a 167 column:
                           it already overhangs its own padding by 0.8px. So
                           the row may run into the panel's right padding
                           (`-mr`) before it wraps — one line at 390 as drawn,
                           two on anything narrower. Wrapped rows sit 16 apart
                           so the two 24px targets tile instead of overlapping. -->
                      <div
                        data-partner-links
                        class="-mr-[15px] flex flex-wrap items-start gap-x-5 gap-y-4"
                      >
                        {#if partner.profile}
                          <a href={partner.profile} data-partner-profile class={LINK}>
                            <span class={LINK_ROW}>
                              <span class={LINK_TEXT}
                                >Profile<span class="sr-only normal-case">, {partner.name}</span
                                ></span
                              >
                              <TextLinkArrow />
                            </span>
                          </a>
                        {/if}
                        <a href={partner.contact} data-partner-contact class={LINK}>
                          <span class={LINK_ROW}>
                            <!-- The space belongs to the OUTER text, before the
                                 hidden span. Inside the span it is lost twice
                                 over: Svelte trims an element's leading
                                 whitespace, and the accessible-name algorithm
                                 trims each child's text — either way the link
                                 was named "ContactMatt Howard". At the end of
                                 the drawn line it paints nothing (the text is
                                 61.11 wide with it and without it). -->
                            <span class={LINK_TEXT}
                              >Contact <span class="sr-only normal-case">{partner.name}</span></span
                            >
                            <TextLinkArrow />
                          </span>
                        </a>
                      </div>
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      {#if hasText}
        <!-- The comp's `text`: headline, 40, body — and 40 again before the
             buttons it does not draw. `lg:col-start-2` so the text keeps the
             right-hand column even when there are no cards to fill the left. -->
        <div class="flex flex-col items-start gap-10 lg:col-start-2">
          {#if heading}
            <h2 id="{uid}-heading" class="t-h2 max-w-[586px] text-primary">{heading}</h2>
          {/if}
          {#if body}
            <!-- Body 1 on a 519 measure. The comp separates paragraphs with a
                 blank LINE (24), not `.richtext-block`'s 1em (16). -->
            <div
              data-partners-body
              class="t-body-1 max-w-[519px] text-primary [&_a]:underline [&_p+p]:mt-6"
            >
              <RichTextBody field={body} />
            </div>
          {/if}
          {#if buttons.length > 0}
            <div class="flex flex-wrap gap-x-10 gap-y-5">
              {#each buttons as button, i (i)}
                <BrandButton
                  href={button.href}
                  target={button.blank ? "_blank" : undefined}
                  rel={button.blank ? "noopener noreferrer" : undefined}
                >
                  {button.text}
                </BrandButton>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</section>
