<script lang="ts">
  // The comp's TEXT-LINK arrow — the "→" after PROFILE and CONTACT on the
  // partner cards, and after every `text link` in the comp's (hidden) resources
  // lists. It is NOT ArrowRight: that one is the 25×25 Noun Project arrow the
  // BUTTONS carry. This one is a flattened "→" text glyph, a VECTOR 10.4 × 7.2
  // in the node data, and Figma exports it on an 11 × 8 canvas.
  //
  // The path below is that export's bytes, not a redraw: node 6822:501
  // (PROFILE), and 6822:504 (CONTACT) exports byte-identically.
  // Partners.test.ts pins its hash. The export's only fill is the text's own
  // `#3D0707`, so it ships with `currentColor` and follows the label.
  //
  // Sized in px, not em: the comp draws it at one size, beside H5.
  let { class: passedClasses = "" }: { class?: string } = $props();
</script>

<svg
  viewBox="0 0 11 8"
  width="11"
  height="8"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  class="shrink-0 {passedClasses}"
>
  <path
    d="M5.90975 7.62548C6.76761 6.63417 7.60642 5.62379 8.46428 4.63248H0V2.993H8.46428C7.60642 2.00169 6.74855 1.01038 5.90975 0H7.83518L10.9998 3.77461V3.85087L7.83518 7.62548H5.90975Z"
  />
</svg>
