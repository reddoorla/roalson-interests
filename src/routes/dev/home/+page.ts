import type { PageLoad } from "./$types";

// Head data only — the layout's <Seo> is the single head source.
// `navOver` as the real home route claims it, and as a literal for the same
// reason (src/routes/nav-over.test.ts reads this file as text): the fixture
// opens on the same HomeHero, so the bar floats over it here too — and the
// footer takes the homepage's graded ground, for the same reason.
export const load: PageLoad = () => ({
  title: "Homepage fixture",
  navOver: "dark" as const,
  footerGround: "fade" as const,
});
