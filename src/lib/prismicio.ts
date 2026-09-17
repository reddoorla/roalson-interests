import * as prismic from "@prismicio/client";
import { enableAutoPreviews, type CreateClientConfig } from "@prismicio/svelte/kit";
import config from "../../slicemachine.config.json";
import type { AllDocumentTypes } from "../prismicio-types";

export const repositoryName = import.meta.env.VITE_PRISMIC_ENVIRONMENT || config.repositoryName;

/**
 * True when the starter has not yet been wired to a real Prismic repository.
 * Prerender entry points (sitemap, dynamic [uid]) short-circuit to empty
 * results in that case so `pnpm build` succeeds on an unconfigured clone.
 */
export const isPlaceholderRepo = repositoryName === "your-prismic-repo-name";

/**
 * Every client is routes-free — deliberately. Prismic's routes resolver
 * validates each `routes` entry against the repo's DOC-BEARING types and
 * rejects EVERY query with a 400 when any entry misses, so a routes config
 * breaks a repo that has not yet published one of the named types (observed
 * live 2026-07-28). Without routes, `getAllByType` on an absent type resolves
 * to an empty list instead of erroring. The cost is that the API no longer
 * fills `doc.url`/`link.url` for content-relationship fields; nothing in the
 * starter reads those today (web-type links carry their own URL), and
 * `linkResolver` below is the local replacement to pass to `asLink` when a
 * consumer does need one.
 */
export const linkResolver: prismic.LinkResolverFunction = (doc) => {
  if (doc.type === "page" && doc.uid) {
    return doc.uid === "home" ? "/" : `/${doc.uid}`;
  }
  return null;
};

export const createClient = ({ cookies, ...config }: CreateClientConfig = {}) => {
  const client = prismic.createClient<AllDocumentTypes>(repositoryName, config);

  enableAutoPreviews({ client, cookies });

  return client;
};
