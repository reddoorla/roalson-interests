/**
 * A link that SAVES its file instead of opening it (MarkUp, 2026-10-01: "should
 * the property package button be an arrow or a download button? … for most
 * people will it download?"; operator: download).
 *
 * The `download` attribute alone cannot do it here. The packages live on
 * Prismic's CDN, another origin, which serves them `Content-Disposition:
 * inline`, and browsers ignore `download` on a cross-origin link: Chrome opens
 * the PDF in its viewer, or in whatever extension owns PDFs. The CDN answers
 * `Access-Control-Allow-Origin: *` and the CSP's `connect-src` already allows
 * `*.prismic.io`, so the click fetches the bytes and saves them from a blob URL,
 * which is same-origin and does honour `download`.
 *
 * Not a server route: adapter-netlify's render function owns `/*`, Netlify runs
 * function paths before redirect rules, and a function streams at most 20 MB.
 * The largest live package is 14.4 MB.
 *
 * Progressive: with no script, or a modified click (new tab, new window), the
 * link is a plain link to the PDF. If the fetch fails the page goes to the PDF,
 * so a press never does nothing.
 */
export function saveOnClick(filename: string) {
  return (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.currentTarget;
    if (!(link instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    // One save per press: a 14 MB package takes seconds, and a second press
    // while it is in flight would save it twice ("… (1).pdf").
    if (link.hasAttribute("aria-busy")) return;
    const url = link.href;
    link.setAttribute("aria-busy", "true");
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const save = document.createElement("a");
        save.href = href;
        save.download = filename;
        document.body.append(save);
        save.click();
        save.remove();
        setTimeout(() => URL.revokeObjectURL(href), 40_000);
      })
      .catch(() => window.location.assign(url))
      .finally(() => link.removeAttribute("aria-busy"));
  };
}
