import { error } from "@sveltejs/kit";

import { loadPage } from "$lib/page-load";
import { createClient, isPlaceholderRepo } from "$lib/prismicio";

export async function load({ fetch, cookies }) {
  // An unconfigured template has no content: answer 404 (which the
  // placeholder-repo prerender rule in svelte.config.js tolerates) instead of
  // querying a repository that does not exist and failing the build with a 500.
  if (isPlaceholderRepo) error(404, { message: "Page not found" });

  // The homepage is the `page` document with uid "home".
  const home = await loadPage(createClient({ fetch, cookies }), "home");

  // The page opens on HomeHero — a dark 528px band that runs UNDER the bar, so
  // the bar floats over it in its reverse tone (see Nav.svelte) and the layout
  // does not pad <main>. The claim is a literal because nav-over.test.ts reads
  // it as text, and it is safe as a literal because +page.svelte renders that
  // band unconditionally, whatever the document holds (see $lib/home-page).
  // `footerGround`: the homepage is the one page whose footer grades from
  // off-white to sand (Footer.svelte). `navWordmark`: the homepage is the one
  // page whose bar has no wordmark until the hero's RI cutout has scrolled away
  // (operator call 8; Nav.svelte measures it against HomeHero's band). All
  // three are literals because src/routes/nav-over.test.ts reads this file as
  // text.
  // `canvasTop`: the colour above the top of the document, which the hero's
  // ground is — HomeHero is FLAT `bg-dark`, not the brand gradient the mastheads
  // wear (see the slice's header). A literal for the same reason as the rest.
  return {
    ...home,
    navOver: "dark" as const,
    navWordmark: "gated" as const,
    canvasTop: "dark" as const,
    footerGround: "fade" as const,
  };
}

// On an unconfigured starter, skip prerendering "/" — the load above would
// 404 on the placeholder repo and fail the build. Real sites still prerender
// the home route normally.
export function entries() {
  return isPlaceholderRepo ? [] : [{}];
}
