import { error } from "@sveltejs/kit";

import { loadPage } from "$lib/page-load";
import { createClient, isPlaceholderRepo } from "$lib/prismicio";

export async function load({ fetch, cookies }) {
  // An unconfigured template has no content: answer 404 (which the
  // placeholder-repo prerender rule in svelte.config.js tolerates) instead of
  // querying a repository that does not exist and failing the build with a 500.
  if (isPlaceholderRepo) error(404, { message: "Page not found" });

  // The homepage is the `page` document with uid "home".
  return loadPage(createClient({ fetch, cookies }), "home");
}

// On an unconfigured starter, skip prerendering "/" — the load above would
// 404 on the placeholder repo and fail the build. Real sites still prerender
// the home route normally.
export function entries() {
  return isPlaceholderRepo ? [] : [{}];
}
