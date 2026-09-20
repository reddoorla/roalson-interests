<script lang="ts">
  // The comp's `Masthead #1` as the Properties page wears it (6991:978 at
  // 1440, 6992:2865 at 390): a 400px band — 240 on mobile — with the page's
  // H1 sitting on the listing column's left edge, its baseline 72px above the
  // band's bottom (44 on mobile, centred).
  //
  // The comp fills the band with a skyline photo. That file is unlicensed
  // Unsplash stock (issue #3), and no CMS field carries a masthead image yet,
  // so the band is the brand's garnet-to-dark gradient until both exist (#15).
  // White on either end of that gradient is measured by theme-contrast.test.ts.
  interface Props {
    title: string;
    class?: string;
  }

  let { title, class: passedClasses = "" }: Props = $props();
</script>

<header
  class="flex h-60 items-end bg-gradient-to-b from-primary to-dark px-5 pb-11 sm:px-8 lg:h-[400px]
    lg:pb-[72px] xl:px-20 {passedClasses}"
>
  <div class="mx-auto w-full max-w-[1280px] lg:grid lg:grid-cols-[397fr_847fr] lg:gap-9">
    <h1 class="t-h2 lg:t-h1 text-center text-white lg:col-start-2 lg:text-left">{title}</h1>
  </div>
</header>
