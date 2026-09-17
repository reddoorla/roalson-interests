import { error, redirect } from "@sveltejs/kit";

import { loadPage } from "$lib/page-load";
import { createClient, isPlaceholderRepo } from "$lib/prismicio";

export async function load({ params, fetch, cookies }) {
  if (params.uid === "home") redirect(308, "/");

  // See the root route: an unconfigured template answers 404 rather than
  // asking a repository that does not exist.
  if (isPlaceholderRepo) error(404, { message: "Page not found" });

  return loadPage(createClient({ fetch, cookies }), params.uid);
}

// Prerender every page document at its real route. "home" renders at "/" via
// the root route, so it is excluded here. Empty on an unconfigured starter so
// `pnpm build` succeeds before the Prismic repo is wired. (No SvelteKit
// `fetch` here — `entries()` has no request event; the client falls back to
// global fetch, which is fine at build time.)
export async function entries() {
  if (isPlaceholderRepo) return [];

  const pages = await createClient().getAllByType("page");
  return pages.filter((page) => page.uid !== "home").map((page) => ({ uid: page.uid }));
}
