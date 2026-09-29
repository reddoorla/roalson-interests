import { cookie } from "@prismicio/client";
import { createClient, linkResolver } from "$lib/prismicio";
import type { RequestHandler } from "./$types";

// @prismicio/svelte's `redirectToPreviewURL`, with the site's `linkResolver`.
// That helper passes none and takes none, and the client is routes-free, so the
// previewed document resolved to no URL and every preview landed on "/" (#10).
// The cookie and the 307 to the `/preview` route are the helper's own.
export const GET: RequestHandler = async ({ fetch, request, cookies }) => {
  const client = createClient({ fetch });
  const params = new URL(request.url).searchParams;
  const previewToken = params.get("token") ?? undefined;

  const path = await client.resolvePreviewURL({
    linkResolver,
    previewToken,
    documentID: params.get("documentId") ?? undefined,
    defaultURL: "/",
  });

  // Prevent a flash of non-preview content on the first page load.
  if (previewToken) cookies.set(cookie.preview, previewToken, { path: "/", httpOnly: false });

  return new Response(undefined, {
    status: 307,
    headers: { Location: path === "/" ? "/preview" : `/preview${path}` },
  });
};
