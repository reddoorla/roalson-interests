import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ImageField } from "@prismicio/client";
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { BRAND_BUTTON_TONES } from "./BrandButton.svelte";
import PageMasthead from "./PageMasthead.svelte";

afterEach(cleanup);

const REPO_ROOT = process.cwd();
const SOURCE = readFileSync(resolve(REPO_ROOT, "src/lib/components/PageMasthead.svelte"), "utf8");
const APP_CSS = readFileSync(resolve(REPO_ROOT, "src/app.css"), "utf8");
const NAV = readFileSync(resolve(REPO_ROOT, "src/lib/components/Nav.svelte"), "utf8");

const photo = {
  url: "https://images.prismic.io/roalson-interests/abc_masthead.jpg?auto=format,compress",
  alt: "The San Antonio skyline at sunrise",
  dimensions: { width: 2560, height: 1739 },
} as unknown as ImageField;

const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

describe("PageMasthead", () => {
  it("is the page's one h1, set in the ramp's H1 from lg and H2 below it", () => {
    const { getAllByRole } = render(PageMasthead, { props: { title: "Our Properties" } });
    const h1s = getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Our Properties");
    expect(h1s[0].className).toMatch(/\bt-h2\b/);
    expect(h1s[0].className).toMatch(/\blg:t-h1\b/);
  });

  it("puts the title on the listing column's edge from lg, centred below", () => {
    const { getByRole } = render(PageMasthead, { props: { title: "Our Properties" } });
    const h1 = getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/\blg:col-start-2\b/);
    expect(h1.className).toMatch(/\btext-center\b/);
    expect(h1.className).toMatch(/\blg:text-left\b/);
  });

  /**
   * The fallback is a promise about PIXELS, so it is pinned as pixels: the
   * literal class list the band carried before the photo existed, transcribed
   * from the pre-#15 file rather than read back out of the component (which
   * would only prove the component equals itself). Whitespace is normalised —
   * the old attribute wrapped across two lines and that never reached a pixel.
   */
  const BAND_BEFORE_THE_PHOTO = [
    "flex",
    "h-60",
    "items-end",
    "bg-gradient-to-b",
    "from-primary",
    "to-dark",
    "px-5",
    "pb-11",
    "sm:px-8",
    "lg:h-[400px]",
    "lg:pb-[72px]",
    "xl:px-20",
  ];

  describe("with no photo to draw", () => {
    // Three ways the CMS says "nothing here", all of which reach the component
    // as a falsy `url`: no field on the document, an empty Image field, and no
    // `page_media` document at all (the loader returns null for the last two).
    const nothing: Array<[string, ImageField | null | undefined]> = [
      ["no image prop at all", undefined],
      ["an explicit null", null],
      ["an empty Prismic image field", {} as unknown as ImageField],
      ["a field with a null url", { url: null } as unknown as ImageField],
    ];

    it.each(nothing)("renders the pre-photo band, class for class, given %s", (_label, image) => {
      const { container } = render(PageMasthead, { props: { title: "Our Properties", image } });
      const header = container.querySelector("header")!;
      expect(classes(header)).toEqual(BAND_BEFORE_THE_PHOTO);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector(".masthead-scrim")).toBeNull();
      expect(container.querySelector(".masthead-shade")).toBeNull();
      expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
    });

    it("keeps passed classes appended to that same band", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", class: "mb-10" },
      });
      expect(classes(container.querySelector("header")!)).toEqual([
        ...BAND_BEFORE_THE_PHOTO,
        "mb-10",
      ]);
    });
  });

  describe("with a photo", () => {
    it("draws it full-bleed through HeroBackgroundImage, sized by imgix", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      const img = container.querySelector("img")!;
      expect(img.getAttribute("src")).toContain("w=1920");
      expect(img.getAttribute("srcset")).toContain("2560w");
      expect(img.getAttribute("alt")).toBe("The San Antonio skyline at sunrise");
      expect(classes(img)).toContain("object-cover");
    });

    it("frames the photo as the comp does — 50% 70%, not the centre — and stays full-bleed", () => {
      // The comp places its 978px-tall skyline at y −401 in the 400px band:
      // 401 of 578px of overflow, 69.4%. Centred (50%), the band showed image
      // rows 30–70% at 1440 — mostly sky, which the scrim then greyed into the
      // "hazy light band" the client saw. Passing a class to
      // HeroBackgroundImage REPLACES its default list rather than adding to
      // it, so the full-bleed half is pinned here as well: dropping
      // `absolute` or `h-full` with the crop would leave a letterboxed photo.
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      const img = classes(container.querySelector("img")!);
      expect(img).toContain("object-[50%_70%]");
      for (const fullBleed of [
        "absolute",
        "bottom-0",
        "left-0",
        "h-full",
        "w-full",
        "object-cover",
      ]) {
        expect(img, `the photo lost \`${fullBleed}\``).toContain(fullBleed);
      }
    });

    it("adds `relative` to the band and nothing else, so the scrim cannot cover the h1", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      expect(classes(container.querySelector("header")!)).toEqual([
        ...BAND_BEFORE_THE_PHOTO,
        "relative",
      ]);
      // The h1's wrapper has to be positioned too: both scrim layers are
      // absolute, and positioned boxes paint over static ones whatever the
      // source order.
      const wrapper = container.querySelector("header > div:last-of-type")!;
      expect(classes(wrapper)).toContain("relative");
    });

    it("hides both scrim layers from assistive tech — they darken pixels, nothing more", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      for (const sel of [".masthead-shade", ".masthead-scrim"]) {
        const layer = container.querySelector(sel);
        expect(layer, `${sel} is missing`).not.toBeNull();
        expect(layer!.getAttribute("aria-hidden")).toBe("true");
        expect(layer!.textContent).toBe("");
      }
    });

    it("preloads the photo by default and not when told otherwise", () => {
      const { unmount } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      expect(document.head.querySelector('link[rel="preload"][as="image"]')).not.toBeNull();
      unmount();
      render(PageMasthead, {
        props: { title: "Our Properties", image: photo, preload: false },
      });
      expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
    });
  });

  /**
   * THE CONTRAST GATE.
   *
   * White text over a photograph has no guaranteed ratio at all, and the
   * photograph is replaceable content — so the only claim worth testing is the
   * one that holds for EVERY photograph: the scrim's own opacity, measured
   * against a pure-white pixel, the brightest ground any image can present.
   *
   * Everything below is read out of the files that decide it — the scrim's
   * stops from app.css, the band's height and pad from its own class list, the
   * H1's line box and size from app.css's type ramp, the floating bar's height
   * and its INK from Nav.svelte, BrandButton.svelte and @theme — so moving any
   * one of them moves this assertion with it, instead of leaving a number in a
   * comment that used to be true.
   *
   * It asserts both directions. Until 2026-09-28 it held only a floor, and the
   * layers drifted to 0.82 black over the bar — sized for dust, an ink the bar
   * had stopped wearing six days earlier — which the client saw as a band "too
   * dark" (Discord, 2026-09-24). A floor cannot see that. The ceilings and the
   * photo window below can.
   */
  describe("white on the photo", () => {
    /** WCAG 2.x relative luminance / contrast (as theme-contrast.test.ts). */
    const luminance = ([r, g, b]: number[]) => {
      const lin = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    /** `rgb(0 0 0 / a) p%` stop lists, out of one rule in app.css.
     *  Throws rather than `expect`s: this runs at collection time, and a parse
     *  that quietly returned nothing would compute every ratio below over an
     *  empty stop list — a green from the absence of data. */
    function stops(rule: string): Array<[number, number]> {
      const block = new RegExp(`\\.${rule}\\s*\\{([\\s\\S]*?)\\}`).exec(APP_CSS);
      if (!block) throw new Error(`no .${rule} rule in app.css`);
      const found = [...block[1].matchAll(/rgb\(0 0 0 \/ ([\d.]+)\)\s+([\d.]+)%/g)].map(
        ([, alpha, pct]) => [Number(pct), Number(alpha)] as [number, number],
      );
      if (found.length < 3) throw new Error(`.${rule} parsed ${found.length} stops, expected 3+`);
      return found;
    }

    /** A CSS linear-gradient's value at `pct`, linearly interpolated. */
    const alphaAt = (list: Array<[number, number]>, pct: number) => {
      if (pct <= list[0][0]) return list[0][1];
      for (let i = 0; i < list.length - 1; i++) {
        const [p0, a0] = list[i];
        const [p1, a1] = list[i + 1];
        if (pct >= p0 && pct <= p1) return a0 + ((a1 - a0) * (pct - p0)) / (p1 - p0);
      }
      return list[list.length - 1][1];
    };

    const SHADE = stops("masthead-shade");
    const SCRIM = stops("masthead-scrim");

    /** `h-60` / `h-[154px]` / `lg:h-20` → pixels. Tailwind's spacing unit is 4px. */
    function px(source: string, token: RegExp): number {
      const m = token.exec(source);
      if (!m) throw new Error(`no ${token} in source`);
      return m[1].endsWith("px") ? parseFloat(m[1]) : Number(m[1]) * 4;
    }

    /** `font-size`, `line-height` and `margin-block` off one @utility in app.css. */
    function ramp(name: string) {
      const block = new RegExp(`@utility ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(APP_CSS);
      if (!block) throw new Error(`no @utility ${name} in app.css`);
      const fontSize = Number(/font-size:\s*([\d.]+)px/.exec(block[1])![1]);
      const lineHeight = Number(/line-height:\s*([\d.]+)px/.exec(block[1])![1]);
      const margin = Number(/margin-block:\s*-([\d.]+)px/.exec(block[1])![1]);
      return { fontSize, lineHeight, margin };
    }

    const breakpoints = [
      {
        name: "1440 (lg)",
        height: px(SOURCE, /lg:h-\[(\d+px)\]\s+lg:pb-/),
        pad: px(SOURCE, /lg:pb-\[(\d+px)\]/),
        shade: px(SOURCE, /masthead-shade[^"]*\slg:h-\[(\d+px)\]/),
        bar: px(NAV, /lg:h-(\d+) /),
        ...ramp("t-h1"),
      },
      {
        name: "390 (base)",
        height: px(SOURCE, /class="flex h-(\d+)\s/),
        pad: px(SOURCE, /\spb-(\d+)\s+sm:/),
        shade: px(SOURCE, /masthead-shade[^"]*\stop-0 h-\[(\d+px)\]/),
        bar: px(NAV, /flex h-\[(\d+px)\]/),
        ...ramp("t-h2"),
      },
    ];
    type Breakpoint = (typeof breakpoints)[number];

    /** items-end, so the h1's margin box bottom sits on the band's pad; the
     *  negative margin-block lets its line box hang `margin` past each edge. */
    const lineBox = (b: Breakpoint) => {
      const bottom = b.height - b.pad + b.margin;
      return { top: bottom - b.lineHeight, bottom };
    };

    /** Black at `alpha` over a pure-white photo pixel. */
    const overWhite = (alpha: number) => [255 * (1 - alpha), 255 * (1 - alpha), 255 * (1 - alpha)];

    /** Both layers stack, so what gets through is the product of what each lets through. */
    const combined = (b: Breakpoint, y: number) => {
      const shade = y < b.shade ? alphaAt(SHADE, (100 * y) / b.shade) : 0;
      const scrim = alphaAt(SCRIM, (100 * y) / b.height);
      return 1 - (1 - shade) * (1 - scrim);
    };

    /** Every whole-pixel row from y0 to y1 inclusive — the span each check scans. */
    const rows = (y0: number, y1: number) =>
      Array.from({ length: Math.ceil(y1) - Math.floor(y0) + 1 }, (_, i) => Math.floor(y0) + i);

    const worst = (b: Breakpoint, y0: number, y1: number, ink: number[]) =>
      Math.min(...rows(y0, y1).map((y) => contrast(ink, overWhite(combined(b, y)))));
    const darkest = (b: Breakpoint, y0: number, y1: number) =>
      Math.max(...rows(y0, y1).map((y) => combined(b, y)));
    const lightest = (b: Breakpoint, y0: number, y1: number) =>
      Math.min(...rows(y0, y1).map((y) => combined(b, y)));

    // ── THE INKS, out of the files that paint them ─────────────────────────

    /** app.css's @theme `--color-*` values, as the palette's own guard reads
     *  them (theme-contrast.test.ts's parseThemeColors). */
    const THEME = (() => {
      const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(APP_CSS);
      if (!block) throw new Error("app.css has no @theme block");
      const out: Record<string, string> = {};
      for (const m of block[1].matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g))
        out[m[1]] = m[2].trim();
      return out;
    })();
    const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };
    /** A `text-<token>` colour → rgb, through @theme. Throws on anything it
     *  cannot measure rather than skipping it. */
    function ink(token: string): number[] {
      const raw = THEME[token];
      if (raw === undefined) throw new Error(`text-${token}: no --color-${token} in @theme`);
      const hex = NAMED[raw] ?? raw;
      if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`--color-${token} is "${raw}", not a hex`);
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    }
    /** The colour tokens in a class list — `text-white` yes, `text-center` no. */
    const textColours = (list: string) =>
      [...list.matchAll(/(?:^|\s)text-([a-z0-9-]+)(?=\s|$)/g)]
        .map((m) => m[1])
        .filter((t) => t in THEME);

    /**
     * What the floating bar paints ON the shade, from the files that paint it.
     *
     *  - The CTA: whatever BrandButton tone Nav.svelte gives it while floating
     *    (`tone={floating ? "light" : …}`), and that tone's `text-*` in
     *    BRAND_BUTTON_TONES. Sand since #96 (2026-09-22); it was dust before,
     *    which is what this shade had been sized for.
     *  - Every other floating-state class list in Nav.svelte
     *    (`{floating ? 'text-light' : …}`): the menu trigger, its no-script
     *    fallback, the no-script link list, and the "Home" text the wordmark
     *    falls back to. The wordmark image is a logo and exempt.
     */
    const BAR_INKS = (() => {
      const tone = /tone=\{floating\s*\?\s*"(\w+)"/.exec(NAV)?.[1];
      if (!tone || !(tone in BRAND_BUTTON_TONES)) {
        throw new Error(`Nav.svelte's floating CTA tone is ${tone}, not a BRAND_BUTTON_TONES key`);
      }
      const cta = textColours(BRAND_BUTTON_TONES[tone as keyof typeof BRAND_BUTTON_TONES]);
      if (cta.length !== 1) throw new Error(`the "${tone}" tone has ${cta.length} text colours`);
      const floating = [...NAV.matchAll(/\{floating\s*\?\s*(["'])([^"']*)\1/g)].flatMap((m) =>
        textColours(m[2]),
      );
      const inks = [
        { what: `the CTA (BrandButton "${tone}")`, token: cta[0] },
        ...[...new Set(floating)].map((token) => ({ what: `Nav's floating text-${token}`, token })),
      ];
      return inks.map((i) => ({ ...i, rgb: ink(i.token) }));
    })();

    /** The floating bar's keyboard focus ring. app.css's ground rule gives
     *  every child of `[data-floating]` `--focus-ring: var(--color-…)`, and the
     *  outline is drawn 2px OUTSIDE the control — still inside the bar, still
     *  on the shade. Non-text, so 3:1 (WCAG 1.4.11 / 2.4.13). */
    const BAR_RING = (() => {
      const rule = [
        ...APP_CSS.matchAll(
          /:where\(([^)]*)\)\s*>\s*\*\s*\{\s*--focus-ring:\s*var\(--color-([a-z0-9-]+)\)/g,
        ),
      ].find((m) => m[1].includes("[data-floating]"));
      if (!rule) throw new Error("no --focus-ring rule for [data-floating] in app.css");
      return { token: rule[2], rgb: ink(rule[2]) };
    })();
    /** WCAG 1.4.11: a focus indicator against what is next to it. */
    const NON_TEXT = 3;

    /** The h1's colour, off its own class list. */
    const TITLE_INK = (() => {
      const cls = /<h1 class="([^"]*)"/.exec(SOURCE)?.[1];
      if (!cls) throw new Error("no <h1 class=…> in PageMasthead.svelte");
      const found = textColours(cls);
      if (found.length !== 1) throw new Error(`the h1 has ${found.length} text colours`);
      return { token: found[0], rgb: ink(found[0]) };
    })();

    // ── THE THRESHOLDS ─────────────────────────────────────────────────────

    /** WCAG 1.4.3, normal text: the bar's CONTACT US is t-h6, 12px. */
    const AA = 4.5;
    /** WCAG 1.4.3, LARGE text — 18pt (24px) and up at this weight. The h1 is
     *  66px / 38px, so 3:1 is what WCAG asks of it. It was held to 4.5:1 until
     *  2026-09-28, by a choice made here and not by WCAG, and that choice cost
     *  0.16 of black under the title. */
    const LARGE = 3;
    const LARGE_TEXT_MIN_PX = 24;

    /** No darker than legible needs. Sand needs 0.605 black over a pure-white
     *  pixel (0.591 at #eae7e4) and white-as-large-text 0.416, so these leave
     *  room to tune and none to drift back to where the client objected:
     *  0.82 over the bar and 0.67 under the title. */
    const BAR_CEILING = 0.7;
    const TITLE_CEILING = 0.55;
    /** Between the bar and the title the photo has to SHOW — the comp draws
     *  no overlay there at all. The old layers let it at 1440 (0.10 at y≈176)
     *  but not at 390, where they never parted below 0.39 black. */
    const WINDOW_CEILING = 0.35;

    it.each(breakpoints)(
      "clears 3:1 (large text) under the h1 at $name, over the brightest pixel any photo can hold",
      (b) => {
        expect(
          b.fontSize,
          `The h1 is ${b.fontSize}px at ${b.name}. The 3:1 below is WCAG's LARGE-text ` +
            `threshold and only holds from ${LARGE_TEXT_MIN_PX}px at this weight — below that ` +
            `this test must ask 4.5:1, and .masthead-scrim must darken to meet it.`,
        ).toBeGreaterThanOrEqual(LARGE_TEXT_MIN_PX);
        const { top, bottom } = lineBox(b);
        const ratio = worst(b, top, bottom, TITLE_INK.rgb);
        expect(
          ratio,
          `text-${TITLE_INK.token} on the scrim over a pure-white photo pixel is ` +
            `${ratio.toFixed(2)}:1 across the h1's line box (y ${top}–${bottom} of ${b.height}), ` +
            `below ${LARGE}:1. The photograph is content an editor replaces, so the scrim — not ` +
            `the picture — is what holds this line. Darken the .masthead-scrim stops that cover ` +
            `that span.`,
        ).toBeGreaterThanOrEqual(LARGE);
      },
    );

    it.each(breakpoints)(
      "clears 4.5:1 for every ink the floating bar paints at $name, over that same pixel",
      (b) => {
        for (const { what, token, rgb } of BAR_INKS) {
          const ratio = worst(b, 0, b.bar, rgb);
          expect(
            ratio,
            `${what} — text-${token}, ${THEME[token]} — on the shade over a pure-white photo ` +
              `pixel is ${ratio.toFixed(2)}:1 across the bar's ${b.bar}px (the shade box is ` +
              `${b.shade}px), below ${AA}:1. /properties claims navOver: "dark", so the bar ` +
              `floats over this band, and the CTA's label is t-h6, 12px — normal text. Darken ` +
              `.masthead-shade (but see the ceiling below), or change the ink.`,
          ).toBeGreaterThanOrEqual(AA);
        }
      },
    );

    it.each(breakpoints)(
      "keeps the bar's focus ring at 3:1 at $name, over that same pixel",
      (b) => {
        const ratio = worst(b, 0, b.bar, BAR_RING.rgb);
        expect(
          ratio,
          `The floating bar's focus ring — --color-${BAR_RING.token}, ${THEME[BAR_RING.token]} — ` +
            `on the shade over a pure-white photo pixel is ${ratio.toFixed(2)}:1, below ` +
            `${NON_TEXT}:1.`,
        ).toBeGreaterThanOrEqual(NON_TEXT);
      },
    );

    it.each(breakpoints)(
      "is no darker than those inks need — over the bar, and under the h1 — at $name",
      (b) => {
        const bar = darkest(b, 0, b.bar);
        expect(
          bar,
          `The bar's ${b.bar}px sit under ${bar.toFixed(3)} black at its darkest; the ceiling ` +
            `is ${BAR_CEILING}. The client read 0.82 here as "too dark" (2026-09-24). If a new ` +
            `ink needs more, the ink is the thing to change.`,
        ).toBeLessThanOrEqual(BAR_CEILING);
        const { top, bottom } = lineBox(b);
        const title = darkest(b, top, bottom);
        expect(
          title,
          `The h1's line box (y ${top}–${bottom}) sits under ${title.toFixed(3)} black at its ` +
            `darkest; the ceiling is ${TITLE_CEILING}. Large text needs 0.416 on pure white.`,
        ).toBeLessThanOrEqual(TITLE_CEILING);
      },
    );

    it.each(breakpoints)("lets the photo show between the bar and the h1 at $name", (b) => {
      const { top } = lineBox(b);
      const clearest = lightest(b, b.bar, top);
      expect(
        clearest,
        `Between the bar (y ${b.bar}) and the h1 (y ${top}) the two layers never drop below ` +
          `${clearest.toFixed(3)} black; they must reach ${WINDOW_CEILING} somewhere, or the ` +
          `band reads as one grey haze. Let .masthead-shade fall away sooner, or start ` +
          `.masthead-scrim later.`,
      ).toBeLessThanOrEqual(WINDOW_CEILING);
    });

    it("read every geometry and ink it measures against out of the files that set them", () => {
      // Guard the guard. Each of these numbers is scraped with a regex from
      // another file, and a regex that silently stopped matching would leave
      // the tests above auditing a zero-height strip — green on anything.
      expect(breakpoints.map((b) => b.height)).toEqual([400, 240]); // the band
      expect(breakpoints.map((b) => b.pad)).toEqual([72, 44]); // its bottom pad
      expect(breakpoints.map((b) => b.shade)).toEqual([176, 154]); // the shade box
      expect(breakpoints.map((b) => b.bar)).toEqual([80, 70]); // Nav.svelte's BAR
      expect(breakpoints.map((b) => b.lineHeight)).toEqual([80, 48]); // app.css ramp
      expect(breakpoints.map((b) => b.margin)).toEqual([18, 11.5]);
      expect(breakpoints.map((b) => b.fontSize)).toEqual([66, 38]);
      expect([SHADE.length, SCRIM.length]).toEqual([5, 4]);
      // The inks: the CTA's tone, then each distinct colour in Nav's floating
      // class lists (the "Home" fallback's white, the trigger's and the
      // no-script list's sand). The TOKENS are pinned, never their hex — the
      // hex is the palette's to move (sand is #e8e1d1 and may become #eae7e4),
      // and the ratios above re-measure it.
      expect(BAR_INKS.map((i) => i.token)).toEqual(["light", "white", "light"]);
      expect(TITLE_INK.token).toBe("white");
      expect(BAR_RING.token).toBe("background");
      // The h1's line box is the same slice of the band at both widths — 44 of
      // 400 over a 72 pad, 25 of 240 over 44 — which is why one scrim serves
      // both. If that ever stops being true the two spans have to diverge.
      const span = breakpoints.map((b) => {
        const { top, bottom } = lineBox(b);
        return [top / b.height, bottom / b.height].map((v) => Number(v.toFixed(3)));
      });
      expect(span[0]).toEqual(span[1]);
    });
  });
});
