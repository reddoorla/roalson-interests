// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      /** What the bar sits on at the top of this route. "dark": the route's
       * first band (a masthead, a hero) runs UNDER the bar, so the bar floats
       * over it in its reverse tone and the layout does not pad <main>. Left
       * out, the bar is solid and <main> clears it. A route that renders a
       * dark first band must say so — src/routes/nav-over.test.ts checks. */
      navOver?: "dark";
      /** "gated": the bar has no wordmark, and keeps floating, until this
       * route's `[data-nav-gate]` element reaches it — the homepage, whose hero
       * opens on a 451px RI cutout (operator call 8, #18). A key of its own
       * and NOT a second `navOver` value: nav-over.test.ts matches the literal
       * `navOver: "dark"`, so a route saying `navOver: "hero"` would read as
       * making no claim at all. Only a route that opens on HomeHero sets it —
       * the same test checks. */
      navWordmark?: "gated";
      /** What the footer's ground grades from on this route. "fade": off-white
       * at its top edge to sand at its foot, from `lg` — the comp's Homepage at
       * 1440, where the footer slides over the pinned photo band. Left out, the
       * footer is flat sand, which is what the comp draws everywhere else
       * (Properties at every width; the Homepage itself at 1280 and 390). */
      footerGround?: "fade";
      /** A route asking to be kept out of search while staying reachable —
       * a sold listing. The layout ORs it with NOINDEX_PREFIXES. */
      noindex?: boolean;
      /** Structured data for this route, serialized by <Seo> into JSON-LD. */
      jsonLd?: object | object[];
    }
    // interface Platform {}
  }
}

export {};
