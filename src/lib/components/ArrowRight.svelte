<script lang="ts">
  // The comp's button arrow, `np_arrow-right_888647` (Noun Project), as
  // exported from Figma node 6904:2083 — the paths below are that export's
  // bytes, not a redraw. Figma exports it twice, cream on the garnet card and
  // garnet on the sand one; the two files were diffed and differ ONLY in fill,
  // so it ships once with `currentColor` and takes its colour from the text,
  // which is what lets a button's hover state recolour it.
  //
  // The 25×25 box and the group's offset inside it are the comp's own
  // (inset 22.08% / 12.92% / 22.08% / 12.5% → translate 3.125, 5.52).
  let { class: passedClasses = "" }: { class?: string } = $props();
</script>

<svg
  viewBox="0 0 25 25"
  width="25"
  height="25"
  aria-hidden="true"
  focusable="false"
  class="shrink-0 {passedClasses}"
>
  <g transform="translate(3.125 5.52)" fill="currentColor">
    <path d="M0 5.93747H16.1455V8.02047H0V5.93747Z" />
    <path
      d="M11.667 13.959L10.208 12.5L15.7295 6.97948L10.208 1.45898L11.667 0L18.6455 6.9795L11.667 13.959Z"
    />
  </g>
</svg>
