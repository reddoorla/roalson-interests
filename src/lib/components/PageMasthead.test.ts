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
   * stops from PageMasthead.svelte, the band's height and pad from its own
   * class list, the H1's line box from app.css's type ramp, the floating bar's
   * height from Nav.svelte — so moving any one of them moves this assertion
   * with it, instead of leaving a number in a comment that used to be true.
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

    /** `line-height` and `margin-block` off one @utility in app.css. */
    function ramp(name: string) {
      const block = new RegExp(`@utility ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(APP_CSS);
      if (!block) throw new Error(`no @utility ${name} in app.css`);
      const lineHeight = Number(/line-height:\s*([\d.]+)px/.exec(block[1])![1]);
      const margin = Number(/margin-block:\s*-([\d.]+)px/.exec(block[1])![1]);
      return { lineHeight, margin };
    }

    const breakpoints = [
      {
        name: "1440 (lg)",
        height: px(SOURCE, /lg:h-\[(\d+px)\]/),
        pad: px(SOURCE, /lg:pb-\[(\d+px)\]/),
        shade: px(SOURCE, /lg:h-\[(\d+px)\]\s*"/),
        bar: px(NAV, /lg:h-(\d+) /),
        ...ramp("t-h1"),
      },
      {
        name: "390 (base)",
        height: px(SOURCE, /"flex h-(\d+) /),
        pad: px(SOURCE, / pb-(\d+) /),
        shade: px(SOURCE, /top-0 h-\[(\d+px)\]/),
        bar: px(NAV, /flex h-\[(\d+px)\]/),
        ...ramp("t-h2"),
      },
    ];

    /** Black at `alpha` over a pure-white photo pixel. */
    const overWhite = (alpha: number) => [255 * (1 - alpha), 255 * (1 - alpha), 255 * (1 - alpha)];

    /** Both layers stack, so what gets through is the product of what each lets through. */
    const combined = (b: (typeof breakpoints)[number], y: number) => {
      const shade = y < b.shade ? alphaAt(SHADE, (100 * y) / b.shade) : 0;
      const scrim = alphaAt(SCRIM, (100 * y) / b.height);
      return 1 - (1 - shade) * (1 - scrim);
    };

    const worst = (b: (typeof breakpoints)[number], y0: number, y1: number, ink: number[]) => {
      let ratio = Infinity;
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        ratio = Math.min(ratio, contrast(ink, overWhite(combined(b, y))));
      }
      return ratio;
    };

    const WHITE = [255, 255, 255];
    // --color-dust: the floating bar's CONTACT US label and menu glyph.
    const DUST = [0xb2, 0xac, 0x9f];
    // 4.5:1 — AA for normal text. The H1 is 66px/38px at weight 500, so WCAG
    // 1.4.3 only asks 3:1 of it; the bar's label is t-h6, 12px, and genuinely
    // does need 4.5. One bar for both, set by the stricter of the two.
    const AA = 4.5;

    it.each(breakpoints)(
      "clears AA under the h1 at $name, over the brightest pixel any photo can hold",
      (b) => {
        // items-end, so the h1's margin box bottom sits on the band's pad; the
        // negative margin-block lets its line box hang `margin` past each edge.
        const bottom = b.height - b.pad + b.margin;
        const top = bottom - b.lineHeight;
        const ratio = worst(b, top, bottom, WHITE);
        expect(
          ratio,
          `White on the scrim over a pure-white photo pixel is ${ratio.toFixed(2)}:1 across the ` +
            `h1's line box (y ${top}–${bottom} of ${b.height}), below ${AA}:1. The photograph is ` +
            `content an editor replaces, so the scrim — not the picture — is what holds this ` +
            `line. Darken the .masthead-scrim stops that cover that span.`,
        ).toBeGreaterThanOrEqual(AA);
      },
    );

    it.each(breakpoints)(
      "clears AA under the floating nav bar at $name, over that same pixel",
      (b) => {
        const ratio = worst(b, 0, b.bar, DUST);
        expect(
          ratio,
          `Dust on the shade over a pure-white photo pixel is ${ratio.toFixed(2)}:1 across the ` +
            `bar's ${b.bar}px (the shade box is ${b.shade}px), below ${AA}:1. /properties claims ` +
            `navOver: "dark", so the bar floats over this band with a dust CONTACT US label — ` +
            `t-h6, 12px, normal text. Dust is a MID tone: a lighter shade moves a bright sky ` +
            `toward it and makes this WORSE. Darken .masthead-shade, or give the bar a tone (#45).`,
        ).toBeGreaterThanOrEqual(AA);
      },
    );

    it("read every geometry it measures against out of the files that set it", () => {
      // Guard the guard. Each of these numbers is scraped with a regex from
      // another file, and a regex that silently stopped matching would leave
      // the two tests above auditing a zero-height strip — green on anything.
      expect(breakpoints.map((b) => b.height)).toEqual([400, 240]); // the band
      expect(breakpoints.map((b) => b.pad)).toEqual([72, 44]); // its bottom pad
      expect(breakpoints.map((b) => b.shade)).toEqual([176, 154]); // the shade box
      expect(breakpoints.map((b) => b.bar)).toEqual([80, 70]); // Nav.svelte's BAR
      expect(breakpoints.map((b) => b.lineHeight)).toEqual([80, 48]); // app.css ramp
      expect(breakpoints.map((b) => b.margin)).toEqual([18, 11.5]);
      expect([SHADE.length, SCRIM.length]).toEqual([4, 4]);
      // The h1's line box is the same slice of the band at both widths — 44 of
      // 400 over a 72 pad, 25 of 240 over 44 — which is why one scrim serves
      // both. If that ever stops being true the two spans have to diverge.
      const span = breakpoints.map((b) => {
        const bottom = b.height - b.pad + b.margin;
        return [(bottom - b.lineHeight) / b.height, bottom / b.height].map((v) =>
          Number(v.toFixed(3)),
        );
      });
      expect(span[0]).toEqual(span[1]);
    });
  });
});
