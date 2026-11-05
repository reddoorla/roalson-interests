// Server-rendered on every host so hooks.server.ts, not netlify.toml's static
// [[headers]] block, decides this page's framing policy: it is the one route
// the Prismic Type Builder and Page Builder frame from another origin. See
// $lib/security/cms-framing.ts.
export const prerender = false;
