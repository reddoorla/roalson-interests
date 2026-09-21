import { describe, expect, it } from "vitest";
import type { Content } from "@prismicio/client";

import { homeFixture, homeHeroFixture } from "./home-fixture";
import { splitHomeHero } from "./home-page";

type PageSlice = Content.PageDocument["data"]["slices"][number];

const other = (id: string) =>
  ({
    id,
    slice_type: "rich_text",
    variation: "default",
    primary: {},
    items: [],
  }) as unknown as PageSlice;

const ids = (slices: readonly PageSlice[]) => slices.map((slice) => slice.id);

describe("splitHomeHero — the home route renders its hero first, whatever the document says", () => {
  it("lifts the hero out of the fixture homepage and leaves the rest", () => {
    const { hero, rest } = splitHomeHero(homeFixture());
    expect(hero?.slice_type).toBe("home_hero");
    expect(rest.some((slice) => slice.slice_type === "home_hero")).toBe(false);
  });

  it("finds a hero the editor did not put first, and keeps the others in order", () => {
    const { hero, rest } = splitHomeHero([other("a"), homeHeroFixture(), other("b")]);
    expect(hero?.id).toBe("fixture-home-hero");
    expect(ids(rest)).toEqual(["a", "b"]);
  });

  it("takes only the FIRST hero — a second stays where the editor put it", () => {
    const second = { ...homeHeroFixture(), id: "second" } as PageSlice;
    const { hero, rest } = splitHomeHero([homeHeroFixture(), other("a"), second]);
    expect(hero?.id).toBe("fixture-home-hero");
    expect(ids(rest)).toEqual(["a", "second"]);
  });

  it("has no hero to give when the document has none — the route renders the bare ground", () => {
    const { hero, rest } = splitHomeHero([other("a"), other("b")]);
    expect(hero).toBeUndefined();
    expect(ids(rest)).toEqual(["a", "b"]);
  });

  it.each([[[]], [null], [undefined]])("tolerates %j", (slices) => {
    expect(splitHomeHero(slices)).toEqual({ hero: undefined, rest: [] });
  });

  it("does not mutate the document's own array", () => {
    const slices = [other("a"), homeHeroFixture()];
    splitHomeHero(slices);
    expect(slices.length).toBe(2);
  });
});
