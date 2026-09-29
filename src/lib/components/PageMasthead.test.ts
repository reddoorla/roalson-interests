import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ImageField } from "@prismicio/client";
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

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
      expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
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

    it("hides the scrim from assistive tech — it darkens pixels, nothing more", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      const layer = container.querySelector(".masthead-scrim");
      expect(layer, ".masthead-scrim is missing").not.toBeNull();
      expect(layer!.getAttribute("aria-hidden")).toBe("true");
      expect(layer!.textContent).toBe("");
    });

    /**
     * THE SHADE IS GONE, and this is what keeps it gone. Until 2026-09-29 a
     * second layer, `.masthead-shade`, darkened the top of the band for a nav
     * floating over the photo; the client asked for the solid bar instead and
     * the "dark cloud" removed (Discord, 2026-09-29). A check for that one
     * class name would pass the same layer back under any other name, so this
     * holds the STRUCTURE: over a photo the band holds exactly the photo, one
     * decorative layer, and the title — and the only `masthead-*` class in the
     * component or in app.css is the scrim's.
     */
    it("draws one layer over the photo — the scrim — and no shade under any name", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      const header = container.querySelector("header")!;
      const children = [...header.children].map((el) =>
        el.tagName === "IMG"
          ? "img"
          : el.getAttribute("aria-hidden") === "true"
            ? `layer ${el.className}`
            : el.querySelector("h1")
              ? "title"
              : `${el.tagName.toLowerCase()} ${el.className}`,
      );
      expect(children).toEqual(["img", "layer masthead-scrim absolute inset-0", "title"]);
      expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);

      const named = (text: string) => [...new Set(text.match(/\bmasthead-[a-z-]+/g) ?? [])];
      expect(named(SOURCE.replace(/\/\/.*$/gm, "")), "PageMasthead.svelte").toEqual([
        "masthead-scrim",
      ]);
      const rules = [...APP_CSS.matchAll(/^\s*\.(masthead-[a-z-]+)\s*\{/gm)].map((m) => m[1]);
      expect(rules, "the .masthead-* rules in app.css").toEqual(["masthead-scrim"]);
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
   * H1's line box, size and ink from app.css's type ramp and @theme — so moving
   * any one of them moves this assertion with it, instead of leaving a number
   * in a comment that used to be true.
   *
   * It asserts both directions: a FLOOR under the h1, and CEILINGS — no darker
   * than the h1 needs, and the photo left to show above it. A floor alone let
   * this band drift to a weight the client read as "too dark" (Discord,
   * 2026-09-24).
   *
   * Until 2026-09-29 this also sized `.masthead-shade` for the sand controls of
   * a nav floating over the photo. No bar sits on the photo now (see
   * src/routes/nav-over.test.ts), so the scrim is the only layer, and the top
   * of the band is held to the photo itself.
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

    const SCRIM = stops("masthead-scrim");

    /** `h-60` / `h-[70px]` / `lg:h-20` → pixels. Tailwind's spacing unit is 4px. */
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
        bar: px(NAV, /lg:h-(\d+) /),
        ...ramp("t-h1"),
      },
      {
        name: "390 (base)",
        height: px(SOURCE, /class="flex h-(\d+)\s/),
        pad: px(SOURCE, /\spb-(\d+)\s+sm:/),
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

    /** The scrim is the band's one layer, so its alpha IS the darkening. */
    const darkening = (b: Breakpoint, y: number) => alphaAt(SCRIM, (100 * y) / b.height);

    /** Every whole-pixel row from y0 to y1 inclusive — the span each check scans. */
    const rows = (y0: number, y1: number) =>
      Array.from({ length: Math.ceil(y1) - Math.floor(y0) + 1 }, (_, i) => Math.floor(y0) + i);

    const worst = (b: Breakpoint, y0: number, y1: number, ink: number[]) =>
      Math.min(...rows(y0, y1).map((y) => contrast(ink, overWhite(darkening(b, y)))));
    const darkest = (b: Breakpoint, y0: number, y1: number) =>
      Math.max(...rows(y0, y1).map((y) => darkening(b, y)));

    // ── THE INK, out of the file that paints it ────────────────────────────

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

    /** The h1's colour, off its own class list. */
    const TITLE_INK = (() => {
      const cls = /<h1 class="([^"]*)"/.exec(SOURCE)?.[1];
      if (!cls) throw new Error("no <h1 class=…> in PageMasthead.svelte");
      const found = textColours(cls);
      if (found.length !== 1) throw new Error(`the h1 has ${found.length} text colours`);
      return { token: found[0], rgb: ink(found[0]) };
    })();

    // ── THE THRESHOLDS ─────────────────────────────────────────────────────

    /** WCAG 1.4.3, LARGE text — 18pt (24px) and up at this weight. The h1 is
     *  66px / 38px, so 3:1 is what WCAG asks of it. It was held to 4.5:1 until
     *  2026-09-28, by a choice made here and not by WCAG, and that choice cost
     *  0.16 of black under the title. */
    const LARGE = 3;
    const LARGE_TEXT_MIN_PX = 24;

    /** No darker than legible needs. White-as-large-text needs 0.416 black over
     *  a pure-white pixel, so this leaves room to tune and none to drift back to
     *  where the client objected: 0.67 under the title. */
    const TITLE_CEILING = 0.55;
    /** Above the title the photo has to SHOW — the comp draws no overlay there
     *  at all. */
    const WINDOW_CEILING = 0.35;
    /** How far down the band that window runs: app.css's "Nothing above 36%:
     *  the top of the band is the photo itself." Held to WINDOW_CEILING there,
     *  not to zero, which is the top strip's rule. A number here, never the
     *  scrim's first stop read back — read back, a scrim that started higher
     *  would carry the window up with it and pass. */
    const PHOTO_TO = 0.36;

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

    it.each(breakpoints)("is no darker under the h1 than it needs to be at $name", (b) => {
      const { top, bottom } = lineBox(b);
      const title = darkest(b, top, bottom);
      expect(
        title,
        `The h1's line box (y ${top}–${bottom}) sits under ${title.toFixed(3)} black at its ` +
          `darkest; the ceiling is ${TITLE_CEILING}. Large text needs 0.416 on pure white.`,
      ).toBeLessThanOrEqual(TITLE_CEILING);
    });

    // From under the top strip (held at zero by the next test) down to
    // PHOTO_TO. It used to ask only that the scrim reach the ceiling SOMEWHERE
    // above the h1, scanning from row 0 — which the next test forces to zero,
    // so it could not fail on its own: a flat 0.44 haze from 31% of the band
    // left it green at both widths. Held everywhere across this span, it also
    // implies that older claim, since the span is above the h1 at both widths.
    it.each(breakpoints)("lets the photo show above the h1 at $name", (b) => {
      const [from, to] = [b.bar, PHOTO_TO * b.height];
      const haze = darkest(b, from, to);
      expect(
        haze,
        `Between the band's top strip (y ${from}) and ${PHOTO_TO * 100}% of it ` +
          `(y ${to.toFixed(1)}) the scrim reaches ${haze.toFixed(3)} black; it must stay ` +
          `within ${WINDOW_CEILING} there, or the band reads as one grey haze. Start ` +
          `.masthead-scrim later.`,
      ).toBeLessThanOrEqual(WINDOW_CEILING);
    });

    // The "dark cloud" the client asked to lose (Discord, 2026-09-29) was the
    // top of this band, where the floating bar sat. The structural test above
    // keeps a second layer out; this keeps the scrim itself from growing into
    // the same place. The strip is a bar's height, read from Nav.svelte.
    it.each(breakpoints)(
      "leaves the top of the band — a bar's height of it — undarkened at $name",
      (b) => {
        const top = darkest(b, 0, b.bar);
        expect(
          top,
          `The band's first ${b.bar}px sit under ${top.toFixed(3)} black at their darkest. ` +
            `Nothing sits on the photo there any more, so nothing darkens it.`,
        ).toBe(0);
      },
    );

    it("read every geometry and ink it measures against out of the files that set them", () => {
      // Guard the guard. Each of these numbers is scraped with a regex from
      // another file, and a regex that silently stopped matching would leave
      // the tests above auditing a zero-height strip — green on anything.
      expect(breakpoints.map((b) => b.height)).toEqual([400, 240]); // the band
      expect(breakpoints.map((b) => b.pad)).toEqual([72, 44]); // its bottom pad
      expect(breakpoints.map((b) => b.bar)).toEqual([80, 70]); // Nav.svelte's BAR
      expect(breakpoints.map((b) => b.lineHeight)).toEqual([80, 48]); // app.css ramp
      expect(breakpoints.map((b) => b.margin)).toEqual([18, 11.5]);
      expect(breakpoints.map((b) => b.fontSize)).toEqual([66, 38]);
      expect(SCRIM.length).toBe(4);
      // The TOKEN is pinned, never its hex — the hex is the palette's to move,
      // and the ratios above re-measure it.
      expect(TITLE_INK.token).toBe("white");
      // The h1's line box is the same slice of the band at both widths — 44 of
      // 400 over a 72 pad, 25 of 240 over 44 — which is why one scrim serves
      // both. If that ever stops being true the two spans have to diverge.
      const span = breakpoints.map((b) => {
        const { top, bottom } = lineBox(b);
        return [top / b.height, bottom / b.height].map((v) => Number(v.toFixed(3)));
      });
      expect(span[0]).toEqual(span[1]);
      // The photo window runs from under the top strip to PHOTO_TO, and both
      // ends are above the h1: an empty or inverted span would scan no rows,
      // and `Math.max()` of nothing is -Infinity — green on anything.
      expect(
        breakpoints.map((b) =>
          [b.bar, PHOTO_TO * b.height, lineBox(b).top].map((v) => Number(v.toFixed(3))),
        ),
        "[top strip, window end, h1 line box top] — each below the last",
      ).toEqual([
        [80, 144, 266],
        [70, 86.4, 159.5],
      ]);
    });
  });
});
