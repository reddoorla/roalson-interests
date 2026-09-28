<script lang="ts">
  // A partner's profile page, /team/<uid> (F4, operator 2026-09-28). No comp
  // exists for it: it is the partner CARD's anatomy at page scale, laid out
  // after the wireframe profile 6745:50216 — headshot left, then role over
  // name over bio on the site's one grid, text at x=513 — the way
  // PropertyDetail scaled up the property card. No back link (decision D7).
  //
  // Every block renders only when its field is filled. A contact value that is
  // set but unusable prints as text, never as a link that goes nowhere.
  import { isFilled } from "@prismicio/client";
  import { PrismicImage } from "@prismicio/svelte";
  import { cappedWidths } from "@reddoorla/maintenance/images";

  import type { PersonDocument } from "../../prismicio-types";
  import RichTextBody from "$lib/components/RichTextBody.svelte";
  import { emailHref, isPlaceholderBio, personDisplayName, phoneHref } from "$lib/person";

  let { person }: { person: PersonDocument } = $props();

  const data = $derived(person.data);
  const name = $derived(personDisplayName(person));
  const role = $derived(data.role?.trim() ?? "");
  const placeholder = $derived(isPlaceholderBio(person));
  const hasPhoto = $derived(isFilled.image(data.photo));
  const bio = $derived(isFilled.richText(data.bio) ? data.bio : undefined);

  const contact = $derived(
    [
      { label: "Email", text: data.email?.trim() ?? "", href: emailHref(data.email) },
      { label: "Phone", text: data.phone?.trim() ?? "", href: phoneHref(data.phone) },
      { label: "Texas license", text: data.license?.trim() ?? "", href: null },
    ].filter((item) => item.text !== ""),
  );
</script>

<article
  aria-labelledby="person-name"
  class="mx-auto max-w-[1440px] px-5 pt-10 pb-20 text-primary sm:px-8 xl:px-20"
>
  <div class="flex flex-col gap-[60px] lg:grid lg:grid-cols-[397fr_847fr] lg:gap-9">
    {#if hasPhoto}
      <!-- The wireframe's headshot column, capped at the partner band's 371.
           The srcset stops at the file's real width (#73: Bart's is 140px). -->
      <div data-person-photo class="aspect-square w-full overflow-hidden bg-dark lg:max-w-[371px]">
        <PrismicImage
          field={data.photo}
          fallbackAlt=""
          widths={cappedWidths(data.photo)}
          sizes="(min-width: 1024px) 371px, 100vw"
          class="size-full object-cover"
        />
      </div>
    {/if}

    <div class="flex flex-col items-start gap-10 lg:col-start-2">
      <div class="flex flex-col gap-5">
        {#if role}
          <p class="t-h4">{role}</p>
        {/if}
        <h1 id="person-name" class="t-h2">{name}</h1>
      </div>

      {#if placeholder}
        <!-- The property status chip. Seen by visitors on purpose: the copy
             under it is not this person's. -->
        <p data-person-placeholder class="bg-primary px-2.5 py-2.5 text-light">
          <span class="t-h5 block">Placeholder bio</span>
        </p>
      {/if}

      {#if bio}
        <div
          data-person-bio
          class="t-body-1 max-w-[519px] [&_a]:underline [&_h2]:t-h4 [&_h2]:mt-10 [&_h2]:mb-5
            [&_p+p]:mt-6 [&_ul]:list-disc [&_ul]:ps-[21px]"
        >
          <RichTextBody field={bio} />
        </div>
      {/if}

      {#if contact.length}
        <dl data-person-contact class="flex flex-col gap-5">
          {#each contact as item (item.label)}
            <div class="flex flex-col gap-[15px]">
              <dt class="t-h5 text-secondary">{item.label}</dt>
              <dd class="t-body-1">
                {#if item.href}
                  <a href={item.href} class="underline hover:no-underline">{item.text}</a>
                {:else}
                  {item.text}
                {/if}
              </dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>
  </div>
</article>
