import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import Nav from "./Nav.svelte";
import { FOOTER_NAV_ID } from "$lib/site-config";

// What the bar is BEFORE script has adopted it — the server's markup, and all a
// browser whose bundle never arrives will ever have (#19).
//
// Nav.test.ts cannot see this state: @testing-library's render() returns after
// mount, so `mounted` is already true by the first assertion. Here `onMount` is
// held back instead of run — the component renders exactly the branch the
// server renders — and then released by hand, which is hydration's one
// observable step. tests/interaction/nav.spec.ts checks the same two states on
// the wire and in a browser with the bundle blocked; this file is the fast half.
const held = vi.hoisted(() => ({ callbacks: [] as Array<() => unknown> }));

vi.mock("svelte", async (importOriginal) => ({
  ...(await importOriginal<typeof import("svelte")>()),
  onMount: (fn: () => unknown) => {
    held.callbacks.push(fn);
  },
}));

/** Let script "arrive": run what the component handed to onMount. */
async function mount() {
  for (const fn of held.callbacks.splice(0)) fn();
  await tick();
  await tick();
}

afterEach(() => {
  cleanup();
  held.callbacks.length = 0;
});

const items = [
  { label: "Our Properties", href: "#properties" },
  { label: "Contact Us", href: "#contact" },
];
const logo = { url: "/logo.svg", reverseUrl: "/logo-reverse.svg", alt: "Roalson Interests — home" };

const bar = (container: HTMLElement) => container.querySelector('nav[aria-label="Primary"]')!;

describe("Nav — before script has mounted", () => {
  it("the trigger is a real link to the footer's nav, not a button that cannot open anything", () => {
    const { container } = render(Nav, { items, logo });
    expect(held.callbacks.length, "onMount was held back, so this IS the pre-mount state").toBe(1);

    expect(bar(container).querySelector("button"), "no dead button").toBeNull();
    const fallback = bar(container).querySelector<HTMLAnchorElement>("a[data-menu-fallback]")!;
    expect(fallback).not.toBeNull();
    expect(fallback.getAttribute("href")).toBe(`#${FOOTER_NAV_ID}`);
    // The id is a public fragment and Footer.test.ts pins the same literal.
    expect(fallback.getAttribute("href")).toBe("#footer-nav");
  });

  it("is named for what it does, and claims no menu state it cannot have", () => {
    const { container } = render(Nav, { items, logo });
    const fallback = bar(container).querySelector("a[data-menu-fallback]")!;
    expect(fallback.getAttribute("aria-label")).toBe("Menu");
    expect(fallback.hasAttribute("aria-expanded")).toBe(false);
    expect(fallback.hasAttribute("aria-controls")).toBe(false);
    expect(fallback.hasAttribute("role")).toBe(false);
  });

  it("is hidden with scripting off, where the <noscript> list has already done its job", () => {
    const { container } = render(Nav, { items, logo });
    const fallback = bar(container).querySelector("a[data-menu-fallback]")!;
    expect(fallback.hasAttribute("data-js-only")).toBe(true);
  });

  it("stands in the button's box, in the bar's tone — and renders nothing for a bar with no menu", () => {
    const solid = render(Nav, { items, logo });
    const onLight = bar(solid.container).querySelector("a[data-menu-fallback]")!;
    expect(onLight.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["min-h-11", "min-w-11", "-mr-3", "text-primary"]),
    );
    expect(onLight.querySelector("svg")).not.toBeNull();
    solid.unmount();

    const floating = render(Nav, { items, logo, over: "dark" });
    const onDark = bar(floating.container).querySelector("a[data-menu-fallback]")!;
    expect(onDark.className.split(/\s+/)).toContain("text-light");
    floating.unmount();

    const bare = render(Nav, { logo });
    expect(bar(bare.container).querySelector("a[data-menu-fallback]")).toBeNull();
  });
});

// #18. The server cannot measure the gate, so it renders a gated wordmark
// HIDDEN — shown-then-hidden would flash a wordmark at every visitor before
// hydration — and marks the one image app.html's <noscript> style must show.
describe("Nav — a gated wordmark, before script has mounted", () => {
  const images = (container: HTMLElement) =>
    Array.from(bar(container).querySelectorAll("a[href='/'] img"));

  it("is hidden in the server's markup, on a floating bar that is not pinned yet", () => {
    const { container } = render(Nav, { items, logo, over: "dark", wordmark: "gated" });
    const [garnet, reverse] = images(container);
    expect(garnet.className.split(/\s+/)).toContain("opacity-0");
    expect(reverse.className.split(/\s+/)).toContain("opacity-0");
    expect(bar(container).hasAttribute("data-floating")).toBe(true);
    expect(bar(container).className.split(/\s+/)).toContain("absolute");
  });

  it("marks the REVERSE lockup, and only it, for the noscript rule", () => {
    const { container } = render(Nav, { items, logo, over: "dark", wordmark: "gated" });
    const [garnet, reverse] = images(container);
    // Scripting off, the bar is floating over the dark hero: white is the
    // wordmark to show. The garnet one must stay at opacity 0 there.
    expect(reverse.getAttribute("data-nav-wordmark")).toBe("gated");
    expect(garnet.hasAttribute("data-nav-wordmark")).toBe(false);
  });

  it("is not hidden, and not marked, on a route that makes no such claim", () => {
    const dark = render(Nav, { items, logo, over: "dark" });
    const [, reverse] = images(dark.container);
    expect(reverse.className.split(/\s+/)).not.toContain("opacity-0");
    expect(dark.container.querySelector("[data-nav-wordmark]")).toBeNull();
    dark.unmount();

    // A solid bar: the rule would light a WHITE wordmark on off-white if the
    // mark were ever unconditional.
    const light = render(Nav, { items, logo });
    const [garnet] = images(light.container);
    expect(garnet.className.split(/\s+/)).not.toContain("opacity-0");
    expect(light.container.querySelector("[data-nav-wordmark]")).toBeNull();
  });
});

describe("Nav — the moment script mounts", () => {
  it("swaps the link for the button, with today's name and menu contract", async () => {
    const { container } = render(Nav, { items, logo });
    await mount();

    expect(bar(container).querySelector("a[data-menu-fallback]"), "the link is gone").toBeNull();
    const trigger = bar(container).querySelector("button")!;
    expect(trigger.getAttribute("aria-label")).toBe("Open menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe("nav-menu");
  });

  it("hands the button the focus the link was holding", async () => {
    const { container } = render(Nav, { items, logo });
    const fallback = bar(container).querySelector<HTMLAnchorElement>("a[data-menu-fallback]")!;
    fallback.focus();
    expect(document.activeElement).toBe(fallback);

    await mount();
    expect(document.activeElement).toBe(bar(container).querySelector("button"));
  });

  it("takes no focus it was not holding", async () => {
    const { container } = render(Nav, { items, logo });
    const home = bar(container).querySelector<HTMLAnchorElement>('a[href="/"]')!;
    home.focus();

    await mount();
    expect(document.activeElement).toBe(home);
  });
});
