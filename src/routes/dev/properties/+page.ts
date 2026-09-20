import type { PageLoad } from "./$types";

// Head data only — the layout's <Seo> is the single head source.
export const load: PageLoad = () => ({ title: "Properties listing fixture" });
