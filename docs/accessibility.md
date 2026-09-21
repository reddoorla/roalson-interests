# Accessibility

This starter targets **WCAG 2.2 Level AA**. Accessibility is treated as a default, not a phase — every component ships accessible-by-default and every PR is gated against regressions.

## What's wired by default

- **Skip-to-main-content link** on every page ([+layout.svelte](../src/routes/+layout.svelte)).
- **Focus-managed `<main>`** with `tabindex="-1"` so route changes can move focus into content.
- **Accessible primitives** for the patterns most likely to ship a11y bugs:
  - [Accordion](../src/lib/components/Accordion.svelte) — disclosure pattern with `aria-expanded`, `aria-controls`, `aria-labelledby`.
  - [Modal](../src/lib/components/Modal.svelte) — native `<dialog>` with backdrop, ESC-to-close, and implicit focus trap.
  - [Nav](../src/lib/components/Nav.svelte) — the menu trigger and the overlay's Close both carry `aria-expanded` + `aria-controls` pointing at the overlay's id, so the menu's state is announced across the swap that unmounts one control and mounts the other. Both acknowledge a press on touch via `data-pressed`: CSS `:active` does not fire for a touch press, so a tap that looks like nothing happened gets repeated. The bar never needs script to stay legible: over a dark first band it floats (white wordmark, dust controls) and is pinned only once script has mounted, so with scripting off it stays on the band it was toned for; the menu's links render into the bar inside `<noscript>`, and `[data-js-only]` (app.html) hides the trigger, whose job the list has done. Nor does it need script to navigate when scripting is on but the bundle never arrives — a state `<noscript>` cannot see: the server renders the trigger as a link to the footer's `<nav id="footer-nav">`, and mount swaps it for the button (handing over keyboard focus if the link held it). On the homepage only, the bar has no wordmark until the hero's band reaches it (`navWordmark: "gated"`): the wordmark is hidden with opacity alone, so the home link stays in the accessibility tree, named and in the tab order, and keyboard focus shows the wordmark inside the ring; with scripting off a `<noscript>` rule shows it from the start. The open menu locks the page behind it through `$lib/utils/scrollLock`, shared with `Modal`.
  - [Slider](../src/lib/components/Slider.svelte) — `aria-roledescription="carousel"`, per-slide controls with `aria-current`.
  - [createCarousel](../src/lib/carousel.svelte.ts) with [CarouselArrows](../src/lib/components/CarouselArrows.svelte) and [CarouselProgress](../src/lib/components/CarouselProgress.svelte) — the headless carousel, for markup `Slider`'s layout cannot hold; its first consumer is the homepage's [featured band](../src/lib/slices/FeaturedProperties/index.svelte). It hands back attribute bags, so the right ARIA is the easy path: a `region` with `aria-roledescription="carousel"` named by a visible heading, each slide a `group` labelled "n of N", and off-stage slides both `aria-hidden` and `inert` so a link in slide 3 is not reachable behind slide 1. Anything that autoplays draws a **Pause / Play control, first in the carousel's tab order** (WCAG 2.2.2) — and only where rotation is possible: under `prefers-reduced-motion` it never starts, so there is no dead button and the progress bar shows position (n / N) instead of a timer. Rotation also holds on hover and on a hidden tab, and **focus entering the carousel stops it until Play is pressed** (APG), so nothing moves under a keyboard user. The live region is polite only while the user is driving; a rotating carousel announcing every dwell is noise. Bar and auto-advance read ONE clock, so Pause freezes both. **The consumer's one obligation: keep every control OUTSIDE the slide elements in the DOM.** A slide that turns away goes `inert`, an inert element cannot hold focus, and a button inside it would turn its own slide from under the focus it holds — the browser drops that focus on `<body>`. Draw the controls inside the card with CSS (the featured band does it by grid placement: the chrome and the bar are siblings of the slides, and each slide is a subgrid that leaves their rows empty). [tests/interaction/featured-properties.spec.ts](../tests/interaction/featured-properties.spec.ts) fails with focus on `BODY` when the arrows are moved into a slide. With scripting off it is slide 1 with its link, and `[data-js-only]` hides the controls that could not have worked.
  - [Form / Field](../src/lib/components/Form.svelte) — every input has a programmatic label, required fields announce "(required)" to screen readers, errors link via `aria-describedby` and surface in a focused error summary.
- **A keyboard-focus floor** — every link, button, `<summary>` and tabbable element gets a 2px `:focus-visible` outline from [app.css](../src/app.css), so a component that ships no ring of its own is still keyboard-navigable (WCAG 2.4.7). Authored `focus-visible:ring-*` utilities still win: the floor is written with `:where()`, which contributes zero specificity. The ring takes its colour from the ground it is drawn on: a ground class (`bg-primary`, `bg-dark`, a `from-primary` gradient, the floating bar's `[data-floating]`) sets `--focus-ring` to off-white for its **children**, and a light ground sets it back to garnet — children, because an outline sits outside its element, on the container's ground; and an inherited custom property, because inheritance resolves to the nearest ground. [src/focus-floor.test.ts](../src/focus-floor.test.ts) fails when the markup uses a ground class it has not classified.
- **`prefers-reduced-motion` honored** in animation primitives ([animateIn.ts](../src/lib/actions/animateIn.ts)) — users with the OS preference get no transform, no transition, immediate reveal. The preference is watched rather than sampled once, so turning it on mid-session stops the reveals where the reader is instead of on their next page load.
- **No content depends on JavaScript to become visible.** The scroll reveal's hidden state ships in the markup for above-fold elements (`data-reveal`), which is what stops content painting and then vanishing at hydration — but a hidden element that JS never un-hides would be worse than the flash. A `<noscript>` style in [app.html](../src/app.html) releases it for scripting-off browsers, and every server-hidden element carries `animateIn`'s `failSafe` timer for the cases where scripting is on but the reveal cannot run (no `IntersectionObserver`, a throttled background tab). Measured with scripting on and off in [tests/interaction/reveal-no-js.spec.ts](../tests/interaction/reveal-no-js.spec.ts).
- **Compiler-level a11y warnings** via Svelte's built-in checks (run on `pnpm lint`).

## Automated testing

| Tool                      | What it gates                                                                               | Where                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `axe-core` via Playwright | Zero WCAG 2 A/AA, 2.1 A/AA, 2.2 AA violations on `/dev/a11y-fixtures` and `/dev/animate-in` | [tests/a11y/fixtures.spec.ts](../tests/a11y/fixtures.spec.ts), runs on every PR |
| `reddoor-maint audit`     | Fleet a11y audit, fails the build on violations                                             | CI (`--only a11y --fail-on-violations`), runs on every PR                       |
| Svelte compiler           | Native a11y rule set                                                                        | `pnpm lint`                                                                     |
| Vitest unit tests         | ARIA attributes on Accordion, Modal, Field, Form                                            | `pnpm test:unit`                                                                |

Run locally:

```bash
pnpm verify           # everything CI runs, in CI's order
pnpm test:unit        # vitest unit tests
pnpm test:smoke       # Playwright + axe (boots vite dev)
pnpm test:a11y        # the fleet a11y audit CI gates on
pnpm dlx @lhci/cli autorun   # Lighthouse against lighthouserc.json — manual, not in CI
```

## Manual testing reference

Automated tooling (axe, the fleet a11y audit, the Svelte compiler) catches the bulk of WCAG violations on every code change. Manual passes aren't part of the standard build. If a client reports an issue or an external audit identifies a gap, these are the checks worth running to reproduce and confirm fixes:

- Keyboard-only navigation through every interactive element, including tab order, visible focus rings, and trap-free modals
- Screen reader pass with VoiceOver (macOS / iOS) and NVDA (Windows / Firefox)
- 200% browser zoom — no clipped content or horizontal scroll
- Windows High Contrast mode — borders, focus rings, and form errors remain visible
- Reduced-motion OS setting — no animation plays
- Color contrast: 4.5:1 on body text, 3:1 on UI components and large text

## Adding new accessible components

1. **Start from a native element** when one exists (`<button>`, `<dialog>`, `<details>`). Re-implementing them in `<div>`s is the #1 source of a11y bugs.
2. **Add the component to `/dev/a11y-fixtures`** so the axe gate covers it.
3. **Pair label + input** with `for`/`id` on every form control (Field handles this).
4. **Don't trap focus accidentally** — only modals/popovers should trap. Everything else should let Tab continue out.
5. **Mark errors with `role="alert"` and `aria-live="polite"`** so screen readers announce them when they appear.

## Accessibility statement

Public-sector and education clients should publish an accessibility statement at `/accessibility`, naming the conformance target (WCAG 2.2 AA), known gaps, and a contact route for reporting barriers. No template ships here — write it against the site's actual audit results, since a statement that overclaims is worse than none.

## Reporting issues

Treat accessibility regressions as P1 bugs. They block merges to `main`.
