import type { PageLoad } from "./$types";

// Head data only — the layout's <Seo> is the single head source. No `navOver`
// and no `canvasTop`, as the real /properties route claims neither: the
// fixture opens on the same PageMasthead under the same solid bar.
export const load: PageLoad = () => ({
  title: "Properties listing fixture",
});
