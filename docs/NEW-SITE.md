# Per-site checklist

Everything in this repo that still carries a template default. `/new-site`
automates most of it; this file is the checklist that survives without the
skill, and the thing to re-read when a site "looks like the starter".

Find what is still unset:

```bash
grep -rn "your-prismic-repo-name\|reddoor-wireframer\|<Site name>\|<Client>" \
  --exclude-dir=node_modules --exclude-dir=.svelte-kit --exclude-dir=build .
```

## Identity

| File                                  | Change                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` → `name`               | The site slug. Fleet audits match sites to Airtable rows by this.                                                                                                                                                           |
| `.github/workflows/ci.yml`            | `netlify-site: "<slug>"` — drives the deploy-preview link CI comments on every PR.                                                                                                                                          |
| `slicemachine.config.json`            | `repositoryName` → the real Prismic repo. **See "Placeholder builds" below.**                                                                                                                                               |
| `src/lib/seo.ts`                      | `SITE_NAME` (defaults to `"Reddoor"` — every `<title>` says so until you change it), `SITE_LOCALE`, `DEFAULT_DESCRIPTION`, `DEFAULT_OG_IMAGE`.                                                                              |
| `src/app.html`                        | `<html lang>` if the primary language is not English.                                                                                                                                                                       |
| `static/favicon.png`                  | The client's icon. Replace it with opaque `favicon.svg` + `favicon-32.png` + `apple-touch-icon.png` and point `src/app.html` at them; see `src/lib/favicon.test.ts`, which fails while the template file is still shipping. |
| `README.md`                           | `<Site name>` and `<Client>`.                                                                                                                                                                                               |
| `package.json` → `reddoor.a11yRoutes` | The site's real routes, once the Prismic repo has content. Ships `[]`. **See "The a11y gate's routes" below.**                                                                                                              |

## Design

| File                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app.css` → `@theme`       | Brand palette and `--font-heading` / `--font-body`. The shipped values are a deliberately mismatched placeholder set, so a token you forgot to set is visible rather than silent. **`--color-secondary` is a TEXT token** — see "Fill-only brand colours" below.                                                                                                                                                                     |
| `src/lib/site-config.json`     | Nav items, `footer.owner` (the copyright holder — set this, not `footer.text`), the footer's closing headline + buttons (`footer.cta`) and its two TREC links (`footer.legal`). The footer lists `nav.items` unless `footer.nav` says otherwise; the office's address and phone are NOT here — they live in `src/lib/office.ts`. Swap the module for a Prismic `settings` loader behind the same exports if the client edits chrome. |
| `svelte.config.js` → `kit.csp` | Add every third-party host the design needs. The baseline allows Prismic, Vimeo, Turnstile and Google Fonts only — a font kit, YouTube embed, donation platform or analytics tag is blocked until listed. Self-hosted fonts need nothing.                                                                                                                                                                                            |

### Fill-only brand colours

**`--color-secondary` is a text token, whatever the brand calls it.** The
template renders `text-secondary` in eight places a new site never touches: the
footer copyright, `Field.svelte`'s description line, the eyebrows on LeadText,
TextColumns and Testimonial, the testimonial role line, the contact intro and a
dev fixture. Assigning a light brand tint to it therefore fails axe on every
page that renders a footer — not in one place you can spot in review.

That happened on roalson-interests: dust `#B2AC9F` measured **1.97:1** on the
page ground. The fix is to split the two jobs rather than rename the failure —
keep `--color-secondary` AA-safe and give the brand colour a token of its own:

```css
--color-secondary: #646059; /* AA-safe secondary TEXT */
--color-dust: #b2ac9f; /* the brand colour, as a FILL */
```

`src/lib/theme-contrast.test.ts` measures every text/ground pair the template
composes and fails below 4.5:1, so `pnpm test` catches this in milliseconds
instead of waiting for the a11y gate to find one node on a built page. It also
fails when a new `text-<token>` class appears that no list classifies — add it
to `LIGHT_GROUND_TEXT` or `DARK_GROUND_TEXT` rather than deleting the check.

### The copyright year

Set **`footer.owner`** ("Acme Holdings"), not `footer.text`. `<Footer>` supplies
the year at render, so it cannot go stale. `footer.text` overrides the whole
line verbatim and freezes whatever year it contains — correct the January it is
written, wrong every January after. It exists only for lines that are not of the
form `© <year> <owner>`.

## Deploy

Netlify environment variables (set on the site, not in the repo):

- `FORMS_INGEST_URL` = `https://reddoor-maintenance.netlify.app/api/forms/<slug>`
- `FORMS_INGEST_TOKEN` = the shared ingest token (same value as the dashboard's)
- `PUBLIC_TURNSTILE_SITE_KEY` (optional) — per-domain widget from dash.cloudflare.com

See [`.env.example`](../.env.example) for the annotated list.

Renovate needs nothing per-repo: it authenticates as the org-wide
`reddoor-renovate` GitHub App.

### Build hook: a Prismic publish must trigger a build

`src/routes/+layout.server.ts` sets `prerender = "auto"`, so `/` is baked at
build time. A Prismic publish reaches visitors only when Netlify builds, and
out of the box only a git push does that. The client can publish all day and
production will not change, while every surface an editor checks shows the new
content: the document reads published, the Prismic preview renders it, and the
next code PR's deploy preview shows it too. Found the hard way on 29-navy
(reddoorla/29-navy#31).

1. Create the hook. Body fields go under `body`. Passed flat, the CLI accepts
   them and silently creates a hook with `title: null, branch: null`:

   ```bash
   netlify api createSiteBuildHook \
     --data '{"site_id":"<site-id>","body":{"title":"Prismic publish","branch":"main"}}'
   netlify api listSiteBuildHooks --data '{"site_id":"<site-id>"}'
   ```

   `<site-id>` is the Netlify site id: `netlify api listSites --data '{"name":"<slug>"}'`, or Site configuration → General in the Netlify UI. The response's `url` is the hook. Never POST to it by hand
   except to deploy production on purpose.

2. Prismic → Settings → Webhooks → Add a webhook: paste the hook URL and
   trigger it on document publish (and unpublish). No secret is needed;
   Netlify ignores the payload.

3. Prove it the way the gap was found, not by reading settings. Publish a
   trivial content change, wait for the build to finish, then:

   ```bash
   curl -s https://<production-url>/ | grep -a -c "<the new string>"
   ```

   `0` means the hook did not fire, or fired before the publish landed.
   Prismic's webhook log and Netlify's deploy list say which.

## Placeholder builds

`slicemachine.config.json`'s `your-prismic-repo-name` sentinel is load-bearing.
While it is in place, Prismic-backed routes 404 during prerender and the build
tolerates it, so a fresh clone is green before the CMS exists. Replacing it with
a real repository name re-arms loud-fail prerendering by design — after that, a
404 during prerender fails the build. The sentinel is read in four places
(`svelte.config.js`, `src/lib/prismicio.ts`, the route loaders, and
`tests/smoke/routes.ts`); change it in `slicemachine.config.json` only.

`VITE_PRISMIC_ENVIRONMENT=your-prismic-repo-name` reaches the same sentinel
from the environment, and it is a **local-only hatch** — for a developer's
machine after the config file names a real repository but before that
repository has content. Never set it in CI or in Netlify's environment. There
it is invisible in the diff, persists indefinitely, and produces a green build
that emits no `build/index.html` alongside a green smoke run that expects `/`
to 404 — every gate agreeing about a site that does not exist. Since #120,
`svelte.config.js` and `tests/smoke/routes.ts` both refuse to load when the
hatch is set and `CI` or `NETLIFY` is, so the failure is loud at the point
someone reaches for it. A site whose Prismic repository is not ready should
stay red, or keep the sentinel in `slicemachine.config.json`.

## The a11y gate's routes

`package.json` → `reddoor.a11yRoutes` is the list of this site's own pages that
`pnpm test:a11y` loads and scans with axe. **The template ships it empty, and
that is not the state a real site stays in.**

It ships empty because of the sentinel above. Since `@reddoorla/maintenance`
0.96.0 the audit checks each configured route's HTTP status first: anything that
is not a 200 is recorded as `route-missing` / `serious` and fails the gate,
instead of running axe over whatever the error page happens to render
(reddoor-maintenance #680 — a designed 404 watermark once reported as a markup
violation with no route named). The template sits on `your-prismic-repo-name`
permanently, so `/` 404s **by design** here: `src/routes/[[preview=preview]]/+page.server.ts`
calls `error(404)` while `isPlaceholderRepo`, and `tests/smoke/routes.ts`
expects exactly that 404. A template that kept `["/"]` would therefore ship its
own CI red — and before 0.96.0 it was worse than red: the gate was quietly
running axe against the 404 page and reporting a green.

Empty is not "gate off". The audit still scans `/dev/a11y-fixtures` and
`/dev/animate-in` and still hydration-smokes `/`, so a real regression in the
shared chrome or the fixtures is still caught; what it does not do is claim to
have scanned a page of the site.

**A real site adds its routes back at `/new-site` step 6**, once
`slicemachine.config.json` names the real Prismic repository and a `home`
document is published:

```jsonc
// package.json
"reddoor": { "a11yRoutes": ["/", "/about", "/contact"] }
```

Grow the list as routes land — it is part of the definition of done for
`/figma-slices`, the same way `tests/smoke/routes.ts` is. At that point the
0.96.0 status guard becomes a real positive-evidence check: the gate passes only
if the route actually served a 200 and axe actually scanned it. Left empty on a
live site, every PR would report "axe 0 violations" having looked at no page of
the site at all — that hole once let a critical `image-alt` violation ship to
five production pages with CI green.

Note the ordering trap: `/new-site` step 3c asks for the gates to be pointed at
real routes at bootstrap, which is before step 6 replaces the sentinel. Between
those two steps `/` still 404s, so `["/"]` is red for a reason that is not a
defect in the site. Until the audit is sentinel-aware
(reddoor-maintenance#863), a site in that window keeps `[]` and adds its routes
with the repository name, in one commit.

## Before pushing

```bash
pnpm verify
```

Runs exactly what CI runs, in CI's order. See [STARTER.md](STARTER.md#scripts).
