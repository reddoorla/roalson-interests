# Roalson Interests

The website for **Roalson Interests**, a commercial real-estate firm in San
Antonio, built and maintained by [Reddoor Creative](https://reddoorla.com).

- **Stack:** SvelteKit + Svelte 5, Tailwind CSS 4, Prismic (models in the repo, `prismic` CLI codegen), Netlify.
- **Content:** edited in Prismic; every publish redeploys the site.
- **Local dev:** `pnpm install` then `pnpm dev` (site on http://localhost:5173; the Prismic Type Builder previews slices through `/slice-simulator`).
- **Checks:** `pnpm verify` runs everything CI runs, in CI's order.

Stack notes, component library, recipes and conventions: [docs/STARTER.md](docs/STARTER.md).
Everything still carrying a template default: [docs/NEW-SITE.md](docs/NEW-SITE.md).
Accessibility and security notes: [docs/accessibility.md](docs/accessibility.md), [docs/security.md](docs/security.md).
