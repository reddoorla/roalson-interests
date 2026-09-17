# <Site name>

The website for **<Client>**, built and maintained by [Reddoor Creative](https://reddoorla.com).

- **Stack:** SvelteKit + Svelte 5, Tailwind CSS 4, Prismic (Slice Machine), Netlify.
- **Content:** edited in Prismic; every publish redeploys the site.
- **Local dev:** `pnpm install` then `pnpm dev` (site on http://localhost:5173, Slice Machine on http://localhost:9999).
- **Checks:** `pnpm verify` runs everything CI runs, in CI's order.

Stack notes, component library, recipes and conventions: [docs/STARTER.md](docs/STARTER.md).
Everything still carrying a template default: [docs/NEW-SITE.md](docs/NEW-SITE.md).
Accessibility and security notes: [docs/accessibility.md](docs/accessibility.md), [docs/security.md](docs/security.md).
