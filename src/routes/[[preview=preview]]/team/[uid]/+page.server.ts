import { error } from "@sveltejs/kit";

import { loadPerson } from "$lib/person-load";
import { createClient, isPlaceholderRepo } from "$lib/prismicio";

export async function load({ params, fetch, cookies, url }) {
  // See the root route: an unconfigured template answers 404 rather than
  // asking a repository that does not exist.
  if (isPlaceholderRepo) error(404, { message: "Page not found" });

  return loadPerson(createClient({ fetch, cookies }), params.uid, url);
}

// Prerender every person, placeholder biographies included: those are
// noindexed and left out of the sitemap, not unpublished. Empty on an
// unconfigured starter, and while the repository has no `person` type yet.
export async function entries() {
  if (isPlaceholderRepo) return [];

  const people = await createClient().getAllByType("person");
  return people.map((person) => ({ uid: person.uid }));
}
