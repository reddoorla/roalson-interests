// Site chrome (navigation + footer) from a checked-in JSON file. A site fills
// it in, or swaps this module for a Prismic `settings`-document loader behind
// the same exports.
//
// What is NOT here: the office's address and phone. They live in `$lib/office`,
// structured, because the contact page and the JSON-LD read them too — one
// address with two homes is how a footer and a contact page come to disagree.
import config from "./site-config.json";

export type NavItem = { label: string; href: string; children?: NavItem[] };
export type FooterLink = { label: string; href: string };

export type SiteConfig = {
  nav: {
    /** `reverseUrl` is the same lockup for dark grounds — the bar floats over a
     *  dark first band only when it has one. `alt` names the home link.
     *  `maxWidth` is the template's knob; this site's Nav sizes the wordmark
     *  from the comp (93 / 145px) and does not read it. */
    logo?: { url: string; reverseUrl?: string; alt?: string; maxWidth?: string };
    items: NavItem[];
    /** The bar's one button — the comp's CONTACT US. */
    cta?: { label: string; href: string };
  };
  footer: {
    /** The closing call to action. `heading` is one string per DRAWN line — the
     *  comp breaks it with U+2028, which is not shipped. `links` are its
     *  buttons, in the comp's order (CONTACT US first). */
    cta?: { heading: string[]; links: FooterLink[] };
    /** Only to make the footer's list differ from the menu's. Left out — as it
     *  is — the footer lists `nav.items`, so the site has ONE list of pages and
     *  the two cannot drift. See `footerNav`. */
    nav?: FooterLink[];
    /** The two Texas Real Estate Commission links. Their labels are wording
     *  TREC prescribes for a broker's site — do not shorten or restyle them. */
    legal?: FooterLink[];
    /** Who holds the copyright, e.g. "Roalson Interests". <Footer> supplies the
     *  year at render. Set THIS, not `text`. */
    owner?: string;
    /** The whole rights line, verbatim — only for a line that is not
     *  "© <year> <owner>". It freezes the year it contains. */
    text?: string;
  };
};

/** The checked-in site config. */
export function loadSiteConfig(): SiteConfig {
  return config as SiteConfig;
}

/** The id of the footer's `<nav>`. It has two readers that must agree —
 *  <Footer>, which renders the element, and <Nav>, whose menu trigger is a link
 *  to it until script has mounted (#19) — so neither of them spells it. */
export const FOOTER_NAV_ID = "footer-nav";

/** The links in the footer's `<nav id="footer-nav">`: the footer's own list if
 *  the config gives one, else the menu's entries, flattened — a group's own
 *  link (when it has one) and then its children, in menu order.
 *
 *  The menu is the default on purpose. `#footer-nav` is where the bar's menu
 *  trigger sends a visitor whose script never arrived (issue #19), so it has to
 *  offer what the menu would have. */
export function footerNav(siteConfig: SiteConfig = loadSiteConfig()): FooterLink[] {
  if (siteConfig.footer.nav) return siteConfig.footer.nav;
  const flatten = (items: NavItem[]): FooterLink[] =>
    items.flatMap((item) => [
      ...(item.href ? [{ label: item.label, href: item.href }] : []),
      ...flatten(item.children ?? []),
    ]);
  return flatten(siteConfig.nav.items);
}
