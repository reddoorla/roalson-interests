import { defineEnvVars } from "@sveltejs/kit/env";

// Kit 3 exposes ONLY the variables declared here, through `$app/env/private`
// and `$app/env/public`. `$env/dynamic/*` still resolves, but it is now a view
// of this same list: with no src/env.ts, `env.FORMS_INGEST_URL` is undefined
// even when Netlify sets it. The build says so in a warning ("will always be
// undefined"), and nothing fails, so a variable read anywhere in src/ and
// missing from this file is a form that silently stops delivering. Every one
// is optional: unset is a real state (dev, CI, a site with no form), and each
// reader already handles it.
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
  FORMS_INGEST_URL: {
    schema: optional,
    description: "Central form-ingest endpoint the contact form posts to.",
  },
  FORMS_INGEST_TOKEN: {
    schema: optional,
    description: "Bearer token for the central form-ingest endpoint.",
  },
  PUBLIC_TURNSTILE_SITE_KEY: {
    public: true,
    schema: optional,
    description: "Cloudflare Turnstile sitekey; unset renders no widget.",
  },
  PUBLIC_MAP_STYLE_URL: {
    public: true,
    schema: optional,
    description:
      "MapLibre style document for the property map; unset uses the committed static/map-style.json.",
  },
});
