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
  // off-white to sand (Footer.svelte). Both are literals because
  // src/routes/nav-over.test.ts reads this file as text.
  return { ...home, navOver: "dark" as const, footerGround: "fade" as const };
}

// On an unconfigured starter, skip prerendering "/" — the load above would
// 404 on the placeholder repo and fail the build. Real sites still prerender
// the home route normally.
export function entries() {
  return isPlaceholderRepo ? [] : [{}];
}
