import type { Handle } from "@sveltejs/kit/hooks";

import { legacyRedirect } from "$lib/legacy-redirects";
import { isCmsFramedRoute, widenFrameAncestors } from "$lib/security/cms-framing";

export const handle: Handle = async ({ event, resolve }) => {
  // The old www.roalson.com's URLs, which reach here and nowhere else
  // ($lib/legacy-redirects says why).
  const legacy = legacyRedirect(event.url.pathname);
  if (legacy) return new Response(null, { status: 301, headers: { location: legacy } });

  const response = await resolve(event);
  // The one route Prismic's builders frame from another origin
  // ($lib/security/cms-framing says why it carries no X-Frame-Options).
  const cmsFramed = isCmsFramedRoute(event.route.id);

  response.headers.set("X-Content-Type-Options", "nosniff");
  if (cmsFramed) {
    response.headers.delete("X-Frame-Options");
    const policy = response.headers.get("Content-Security-Policy");
    if (policy) response.headers.set("Content-Security-Policy", widenFrameAncestors(policy));
  } else {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
};
