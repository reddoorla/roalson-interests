<script lang="ts">
  // The download mark for a button that saves a file. Designed from the system,
  // as PlayPauseGlyph was: the comp has no download icon, so this is
  // ArrowRight's own two paths (the Noun Project export's bytes) turned to
  // point down, over a bar of the arrow's shaft weight. Same 25×25 box and
  // `currentColor`, so a button's hover recolours it like the arrow.
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
  <g fill="currentColor">
    <g transform="translate(19.48 1) rotate(90)">
      <path d="M0 5.93747H16.1455V8.02047H0V5.93747Z" />
      <path
        d="M11.667 13.959L10.208 12.5L15.7295 6.97948L10.208 1.45898L11.667 0L18.6455 6.9795L11.667 13.959Z"
      />
    </g>
    <rect x="4" y="21.4" width="17" height="2.083" />
  </g>
</svg>
