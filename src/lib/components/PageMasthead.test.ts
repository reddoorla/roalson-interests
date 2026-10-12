import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ImageField } from "@prismicio/client";
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import PageMasthead from "./PageMasthead.svelte";

afterEach(cleanup);

const REPO_ROOT = process.cwd();
const APP_CSS = readFileSync(resolve(REPO_ROOT, "src/app.css"), "utf8");

const photo = {
  url: "https://images.prismic.io/roalson-interests/abc_masthead.jpg?auto=format,compress",
  alt: "The San Antonio skyline at sunrise",
  dimensions: { width: 2560, height: 1739 },
} as unknown as ImageField;

const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

describe("PageMasthead", () => {
  it("is the page's one h1", () => {
    const { getAllByRole } = render(PageMasthead, { props: { title: "Our Properties" } });
    const h1s = getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Our Properties");
  });

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

    it.each(nothing)("draws no photo and preloads none, given %s", (_label, image) => {
      const { container } = render(PageMasthead, { props: { title: "Our Properties", image } });
      expect(container.querySelector("img")).toBeNull();
      expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
    });
  });

  describe("with a photo", () => {
    it("draws the CMS's photo, with its alt text", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      const img = container.querySelector("img")!;
      expect(img.getAttribute("src")).toContain("roalson-interests/abc_masthead.jpg");
      expect(img.getAttribute("alt")).toBe("The San Antonio skyline at sunrise");
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

    // Positioned layers paint over static boxes whatever the source order, so
    // the band has to contain the photo and the scrim, and the h1 has to be
    // lifted to their level and stacked after the scrim — or the scrim darkens
    // the title as much as the photo, which no ratio below can see.
    it("keeps its layers inside the band, and the h1 above the scrim", () => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo },
      });
      const header = container.querySelector("header")!;
      const scrim = container.querySelector(".masthead-scrim")!;
      const h1 = container.querySelector("h1")!;
      const positioned = (el: Element) =>
        classes(el).some((c) => /^(?:relative|absolute|sticky|fixed)$/.test(c));
      const zIndex = (el: Element) => {
        const m = classes(el)
          .map((c) => /^(-?)z-(\d+)$/.exec(c))
          .filter(Boolean)
          .at(-1);
        return m ? Number(`${m[1]}${m[2]}`) : undefined;
      };

      expect(positioned(header), "the band does not contain its photo and scrim").toBe(true);
      const lifted: Element[] = [];
      for (let el: Element | null = h1; el && el !== header; el = el.parentElement)
        if (positioned(el)) lifted.push(el);
      expect(lifted.length, "nothing from the h1 up to the band is positioned").toBeGreaterThan(0);
      const title =
        lifted
          .map(zIndex)
          .filter((z) => z !== undefined)
          .at(-1) ?? 0;
      const under = zIndex(scrim) ?? 0;
      const after = Boolean(scrim.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(title > under || (title === under && after), "the scrim paints over the h1").toBe(
        true,
      );
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
   * Text over a photograph has no guaranteed ratio at all, and the photograph
   * is replaceable content — so the only claim worth testing is the one that
   * holds for EVERY photograph: the h1's ink against every ground the scrim can
   * leave under it, from a pure-black photo pixel to a pure-white one. An ink
   * inside that range is matched exactly by some photograph and scores 1:1; an
   * ink outside it is measured against the nearer end — for white text, the
   * scrim over a pure-white pixel.
   *
   * Everything below is read out of what decides it — the scrim's stops from
   * app.css, the band's height and pad and the h1's ramp and ink from the
   * classes the component RENDERS, at every Tailwind screen that sets one, and
   * the ramp's line box and the ink's hex from app.css — so a designer's new
   * pad, ramp, scrim colour or ink is measured, not refused. A fixed `h-*` is
   * measured at that height; a `min-h-*` alone, over every height the band can
   * grow to. Only the floor is asserted: WCAG's, for the size the h1 is at that
   * width.
   */
  describe("the h1 on the photo", () => {
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

    /** One gradient stop's colour: `rgb()`/`rgba()` in either syntax, a hex,
     *  `black`/`white` or `transparent`. */
    function stopColour(text: string, rule: string): { rgb: number[]; alpha: number } {
      if (text === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
      const fn =
        /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(
          text,
        );
      if (fn) {
        const alpha = fn[4] === undefined ? 1 : Number(fn[4]) / (fn[5] ? 100 : 1);
        return { rgb: fn.slice(1, 4).map(Number), alpha };
      }
      const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(NAMED[text] ?? text);
      if (hex) {
        const alpha = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
        return { rgb: [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)), alpha };
      }
      throw new Error(`.${rule}: cannot read the stop "${text}"`);
    }

    /** The stops of one rule's `linear-gradient` in app.css, top to bottom, in
     *  percent of the band, each with its alpha and its colour premultiplied by
     *  it — the space a CSS gradient interpolates in. Unplaced stops are placed
     *  as CSS places them.
     *  Throws rather than `expect`s: this runs at collection time, and a parse
     *  that quietly returned nothing — or skipped a stop it could not read —
     *  would compute every ratio below over the wrong gradient. */
    function stops(rule: string) {
      const block = new RegExp(`\\.${rule}\\s*\\{([\\s\\S]*?)\\}`).exec(APP_CSS);
      if (!block) throw new Error(`no .${rule} rule in app.css`);
      const body = /linear-gradient\(([\s\S]*)\)/.exec(block[1])?.[1];
      if (!body) throw new Error(`.${rule} draws no linear-gradient`);
      const args = body.split(/,(?![^(]*\))/).map((arg) => arg.trim());
      let upward = false;
      if (/^(?:to\s|-?[\d.]+(?:deg|turn|rad|grad)$)/.test(args[0])) {
        const direction = args.shift()!;
        upward = /^(?:to top|0deg)$/.test(direction);
        if (!upward && !/^(?:to bottom|180deg)$/.test(direction))
          throw new Error(`.${rule} runs "${direction}", not up or down the band`);
      }
      const list = args.map((arg) => {
        const [, colour, at] = /^([\s\S]*?)(?:\s+(-?[\d.]+)%)?$/.exec(arg)!;
        return { ...stopColour(colour, rule), pos: at === undefined ? undefined : Number(at) };
      });
      if (list.length < 2) throw new Error(`.${rule}: read ${list.length} stops`);
      list[0].pos ??= 0;
      list[list.length - 1].pos ??= 100;
      let reached = -Infinity;
      for (const stop of list)
        if (stop.pos !== undefined) stop.pos = reached = Math.max(reached, stop.pos);
      for (let i = 1; i < list.length - 1; i++) {
        if (list[i].pos !== undefined) continue;
        let j = i;
        while (list[j].pos === undefined) j++;
        const [from, to] = [list[i - 1].pos!, list[j].pos!];
        for (let k = i; k < j; k++) list[k].pos = from + ((to - from) * (k - i + 1)) / (j - i + 1);
      }
      const placed = list.map(({ rgb, alpha, pos }) => ({
        pos: upward ? 100 - pos! : pos!,
        alpha,
        pre: rgb.map((c) => c * alpha),
      }));
      return upward ? placed.reverse() : placed;
    }

    const SCRIM = stops("masthead-scrim");

    /** The scrim `pct` of the way down the band, linearly interpolated. */
    const scrimAt = (pct: number) => {
      const after = SCRIM.findIndex((s) => s.pos >= pct);
      if (after === 0) return SCRIM[0];
      if (after === -1) return SCRIM[SCRIM.length - 1];
      const [s0, s1] = [SCRIM[after - 1], SCRIM[after]];
      const t = (pct - s0.pos) / (s1.pos - s0.pos);
      return {
        alpha: s0.alpha + (s1.alpha - s0.alpha) * t,
        pre: s0.pre.map((c, k) => c + (s1.pre[k] - c) * t),
      };
    };

    /** The band as a visitor gets it, with a photo: its classes, the h1's, and
     *  every element's from the h1 up to the band, where its colour can be set. */
    const RENDERED = (() => {
      const { container } = render(PageMasthead, {
        props: { title: "Our Properties", image: photo, preload: false },
      });
      const band = container.querySelector("header");
      const title = container.querySelector("h1");
      if (!band || !title) throw new Error("PageMasthead rendered no <header> or no <h1>");
      const chain: string[][] = [];
      for (let el: Element | null = title; el && el !== band.parentElement; el = el.parentElement)
        chain.push(classes(el));
      const out = { band: classes(band), title: classes(title), chain };
      cleanup();
      return out;
    })();

    /** Tailwind's screens, mobile first; "" is no prefix. */
    const SCREENS = ["", "sm", "md", "lg", "xl", "2xl"];

    /** What one screen's own classes set for `utility`, before the cascade. */
    const setAt = (list: string[], screen: string, utility: RegExp) =>
      list
        .map((cls) =>
          !screen ? cls : cls.startsWith(`${screen}:`) ? cls.slice(screen.length + 1) : "",
        )
        .map((cls) => utility.exec(cls)?.[1])
        .filter((value) => value !== undefined)
        .at(-1);

    /** Each screen keeps the last value set at or below it. */
    const cascade = (read: (screen: string) => string | undefined) =>
      SCREENS.reduce<Array<string | undefined>>((out, s, i) => [...out, read(s) ?? out[i - 1]], []);

    /** `60` / `[400px]` / `[30rem]` → pixels. Tailwind's spacing unit is 4px. */
    function px(value: string | undefined, utility: string): number {
      const m = /^(?:([\d.]+)|\[([\d.]+)(px|rem)\])$/.exec(value ?? "");
      if (!m) throw new Error(`${utility}-${value}: not a fixed length this test can measure`);
      return m[1] ? Number(m[1]) * 4 : Number(m[2]) * (m[3] === "rem" ? 16 : 1);
    }

    /** `font-size`, `line-height`, `margin-block` and `font-weight` off one
     *  @utility in app.css. */
    function ramp(name: string | undefined) {
      const block = new RegExp(`@utility ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(APP_CSS);
      if (!name || !block) throw new Error(`the h1's type ramp ${name} is no @utility in app.css`);
      const read = (prop: string, unit: string) =>
        Number(new RegExp(`${prop}:\\s*(-?[\\d.]+)${unit}`).exec(block[1])?.[1] ?? 0);
      const fontSize = read("font-size", "px");
      const lineHeight = read("line-height", "px");
      if (!(fontSize > 0 && lineHeight > 0))
        throw new Error(`@utility ${name}: no font-size and line-height in px`);
      return {
        fontSize,
        lineHeight,
        margin: -read("margin-block", "px"),
        weight: read("font-weight", "") || 400,
      };
    }

    const INK = new RegExp(`^text-(${Object.keys(THEME).join("|")})$`);
    const heights = cascade((s) => setAt(RENDERED.band, s, /^h-(.+)$/));
    const minHeights = cascade((s) => setAt(RENDERED.band, s, /^min-h-(.+)$/));
    const pads = cascade(
      (s) =>
        setAt(RENDERED.band, s, /^pb-(.+)$/) ??
        setAt(RENDERED.band, s, /^py-(.+)$/) ??
        setAt(RENDERED.band, s, /^p-(.+)$/),
    );
    const ramps = cascade((s) => setAt(RENDERED.title, s, /^(t-[a-z0-9-]+)$/));
    // The h1's own colour beats an ancestor's at every screen: declared beats
    // inherited, whatever the ancestor's breakpoint.
    const inks = SCREENS.map((_, i) =>
      RENDERED.chain.map((list) => cascade((s) => setAt(list, s, INK))[i]).find(Boolean),
    );

    const breakpoints = SCREENS.map((screen, i) => {
      const tone = inks[i];
      if (!tone) throw new Error(`the h1 has no @theme text colour at ${screen || "base"}`);
      const fixed = heights[i] === undefined ? undefined : px(heights[i], "h");
      const least = minHeights[i] === undefined ? undefined : px(minHeights[i], "min-h");
      if (fixed === undefined && least === undefined)
        throw new Error(`the band sets no h-* or min-h-* at ${screen || "base"}`);
      return {
        name: screen || "base",
        height: Math.max(fixed ?? 0, least ?? 0),
        grows: fixed === undefined,
        pad: pads[i] === undefined ? 0 : px(pads[i], "pb"),
        ...ramp(ramps[i]),
        ink: tone,
      };
    }).filter(
      (b, i, all) =>
        i === 0 ||
        JSON.stringify({ ...b, name: "" }) !== JSON.stringify({ ...all[i - 1], name: "" }),
    );
    type Breakpoint = (typeof breakpoints)[number];

    /** items-end, so the h1's margin box bottom sits on the band's pad; the
     *  negative margin-block lets its line box hang `margin` past each edge. */
    const lineBox = (b: Breakpoint) => {
      const bottom = b.height - b.pad + b.margin;
      return { top: bottom - b.lineHeight, bottom };
    };

    /** The rows to measure. A band that only has a floor can grow, and a taller
     *  band carries its bottom-anchored h1 further down its gradient: every
     *  height it can reach puts the line box between the line box's top at the
     *  floor and the band's foot. */
    const span = (b: Breakpoint) => {
      const { top, bottom } = lineBox(b);
      return { top, bottom: b.grows ? b.height : bottom };
    };

    /** WCAG 1.4.3: LARGE text — 24px, or 18.66px from bold — needs 3:1; the rest 4.5:1. */
    const floor = (b: Breakpoint) =>
      b.fontSize >= 24 || (b.weight >= 700 && b.fontSize >= 18.66) ? 3 : 4.5;

    /** The darkest and the brightest ground the scrim can leave at row `y`:
     *  over a pure-black photo pixel, and over a pure-white one. */
    const grounds = (b: Breakpoint, y: number) => {
      const { alpha, pre } = scrimAt((100 * y) / b.height);
      return [pre, pre.map((c) => c + 255 * (1 - alpha))];
    };

    /** Every whole-pixel row from y0 to y1 inclusive — the span each check scans. */
    const rows = (y0: number, y1: number) =>
      Array.from({ length: Math.ceil(y1) - Math.floor(y0) + 1 }, (_, i) => Math.floor(y0) + i);

    /** The lowest ratio any photograph can give `rgb` across rows y0–y1. An ink
     *  whose luminance lies between a row's darkest and brightest ground is
     *  matched exactly by some photo there, so that row scores 1:1. */
    const worst = (b: Breakpoint, y0: number, y1: number, rgb: number[]) =>
      Math.min(
        ...rows(y0, y1).map((y) => {
          const [dark, light] = grounds(b, y);
          const l = luminance(rgb);
          if (l < luminance(dark)) return contrast(rgb, dark);
          if (l > luminance(light)) return contrast(rgb, light);
          return 1;
        }),
      );

    it.each(breakpoints)(
      "clears WCAG AA under the h1 at $name, over any pixel a photo can hold",
      (b) => {
        const { top, bottom } = span(b);
        const needed = floor(b);
        const ratio = worst(b, top, bottom, ink(b.ink));
        expect(
          ratio,
          `text-${b.ink} on the scrim is ${ratio.toFixed(2)}:1 over the worst photo pixel ` +
            `across the h1's line box (y ${top}–${bottom} of ${b.height}), below the ${needed}:1 ` +
            `WCAG asks of ${b.fontSize}px text. The photograph is content an editor replaces, so ` +
            `the scrim — not the picture — is what holds this line. For a light ink, darken the ` +
            `.masthead-scrim stops that cover that span; an ink no lighter than the scrim over ` +
            `a white pixel can be matched by some photo, and no darker scrim saves it.`,
        ).toBeGreaterThanOrEqual(needed);
      },
    );

    it("measured a line box inside the band at every width it checks", () => {
      // Guard the guard: a parse that read the wrong class would leave the
      // test above auditing an empty or out-of-band strip — green on anything.
      for (const b of breakpoints) {
        const { top, bottom } = lineBox(b);
        expect(top, `${b.name}: the h1's line box starts above the band`).toBeGreaterThanOrEqual(0);
        expect(bottom, `${b.name}: the h1's line box ends below the band`).toBeLessThanOrEqual(
          b.height,
        );
        expect(rows(top, bottom).length, `${b.name}: no rows to scan`).toBeGreaterThan(1);
      }
    });
  });
});
