import type { PageLoad } from "./$types";

// Head data only — the layout's <Seo> is the single head source.
// `navOver` as the real /properties route claims it: the fixture opens on the
// same PageMasthead, so the bar floats over it here too.
export const load: PageLoad = () => ({
  title: "Properties listing fixture",
  navOver: "dark" as const,
});
