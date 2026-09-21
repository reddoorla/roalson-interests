<script lang="ts">
  // The footer on the ground only the homepage asks for — off-white grading to
  // sand from `lg` — through the real layout. The footer is layout chrome, so
  // every page renders it; what no page that answers 200 today does is claim
  // `footerGround: "fade"` (see +page.ts). /dev/* 404s on every deployed build.
  //
  // The band above stands in for the homepage's photo band (800 tall at `lg`,
  // 240 below) on the ground PageMasthead uses while that photo is unlicensed,
  // so the footer's top edge is seen against what it will actually follow.
</script>

<div class="h-60 bg-gradient-to-b from-primary to-dark lg:h-[800px]"></div>
