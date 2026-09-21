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
      /** Optional site chrome a route may supply to override the shared layout's
       * Footer defaults from src/lib/site-config.json. Typed here so the
       * layout↔route contract is checked at both ends fleet-wide. */
      footerColumns?: {
        items: (
          | { text: string; href?: string }
          | {
              image: { url: string; maxWidth?: string; alt?: string };
              href?: string;
            }
        )[];
      }[];
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
