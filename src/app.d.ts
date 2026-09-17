// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      /** Optional site chrome a route may supply to override the shared layout's
       * Nav/Footer defaults from src/lib/site-config.json. No route in the bare
       * template supplies these. Typed here so the
       * layout↔route contract is checked at both ends fleet-wide. */
      navLinks?: { text: string; href: string }[];
      footerColumns?: {
        items: (
          | { text: string; href?: string }
          | {
              image: { url: string; maxWidth?: string; alt?: string };
              href?: string;
            }
        )[];
      }[];
    }
    // interface Platform {}
  }
}

export {};
