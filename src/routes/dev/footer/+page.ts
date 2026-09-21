import type { PageLoad } from "./$types";

// Head data only — the layout's <Seo> is the single head source.
// `footerGround` as the HOMEPAGE will claim it: no route that renders on the
// placeholder repo asks for the footer's graded ground yet (`/` answers 404
// until Prismic is wired), so this fixture is where that ground can be looked
// at, and where tests/interaction/footer.spec.ts measures it.
export const load: PageLoad = () => ({
  title: "Footer fixture",
  footerGround: "fade" as const,
});
