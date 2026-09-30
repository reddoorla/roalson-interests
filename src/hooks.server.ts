import type { Handle } from "@sveltejs/kit";

import { legacyRedirect } from "$lib/legacy-redirects";

export const handle: Handle = async ({ event, resolve }) => {
  // The old www.roalson.com's URLs, which reach here and nowhere else
  // ($lib/legacy-redirects says why).
  const legacy = legacyRedirect(event.url.pathname);
  if (legacy) return new Response(null, { status: 301, headers: { location: legacy } });

  const response = await resolve(event);

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
};
