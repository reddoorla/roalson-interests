import type { PageLoad } from "./$types";

// Head data for the fixtures page (a static route sets head via data, not its
// own tags — the root layout's <Seo> is the single head source). The fleet
// lighthouse audit scores this page's SEO category on the dev server, where
// meta-description is 1 of its 13 weights.
export const load: PageLoad = () => ({
  title: "Accessibility fixtures",
  meta_description:
    "Synthetic fixtures page exercising the template's accessible component primitives for the automated axe and Lighthouse gates.",
});
