import { error } from "@sveltejs/kit";
import { NotFoundError, RepositoryNotFoundError } from "@prismicio/client";

import type { PageDocument } from "../prismicio-types";
import { pageMeta } from "$lib/page-meta";

/** The minimal client surface the loader needs — method syntax keeps the real
 *  `createClient()` return type assignable, and lets tests pass a stub. */
export type PageClient = {
  getByUID(type: "page", uid: string): Promise<PageDocument>;
};

/** Await one Prismic lookup, turning ONLY a genuine miss into a 404.
 *
 *  A miss is Prismic's NotFoundError: no document with that uid. Everything
 *  else — an outage, a bad access token, a wrong repository name, a malformed
 *  response — is rethrown so it surfaces as a 5xx at runtime and fails a
 *  prerender loudly instead of baking a false "Page not found" into the build.
 *
 *  Every document route goes through this rather than repeating the catch,
 *  because the one subtle line in it is the one a copy gets wrong:
 *  RepositoryNotFoundError EXTENDS NotFoundError, and means "wrong repository
 *  name", not "no such page". */
export async function orNotFound<T>(lookup: Promise<T>): Promise<T> {
  try {
    return await lookup;
  } catch (err) {
    if (err instanceof NotFoundError && !(err instanceof RepositoryNotFoundError)) {
      error(404, { message: "Page not found" });
    }
    throw err;
  }
}

/** Load one `page` document and the layout's head payload for it.
 *
 *  (The route loaders answer 404 themselves on the placeholder repo before
 *  calling this, so an unconfigured clone still builds.) */
export async function loadPage(client: PageClient, uid: string) {
  const page = await orNotFound(client.getByUID("page", uid));
  return { page, ...pageMeta(page) };
}
