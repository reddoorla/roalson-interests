import { NotFoundError, RepositoryNotFoundError } from "@prismicio/client";
import { describe, expect, it } from "vitest";

import { loadPropertiesMasthead, type PageMediaClient } from "./page-media-load";
import type { PageMediaDocument } from "../prismicio-types";

const IMAGE = {
  url: "https://images.prismic.io/roalson-interests/abc_masthead.jpg?auto=format,compress",
  alt: "The San Antonio skyline at sunrise",
  dimensions: { width: 2560, height: 1739 },
  copyright: null,
  id: "abc",
  edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
};

const client = (properties_masthead: unknown): PageMediaClient => ({
  getSingle: async () => ({ data: { properties_masthead } }) as unknown as PageMediaDocument,
});

const throwing = (error: unknown): PageMediaClient => ({
  getSingle: async () => {
    throw error;
  },
});

describe("loadPropertiesMasthead", () => {
  it("returns the image when the singleton carries one", async () => {
    await expect(loadPropertiesMasthead(client(IMAGE))).resolves.toEqual(IMAGE);
  });

  it("returns null for an empty image field", async () => {
    // What Prismic sends for an Image field nobody filled.
    await expect(loadPropertiesMasthead(client({}))).resolves.toBeNull();
  });

  it("returns null when no page_media document exists yet", async () => {
    // The ordinary launch state: the model reaches Prismic through CI, and an
    // editor creates the document afterwards.
    const missing = new NotFoundError("not found", "/api/v2", undefined);
    await expect(loadPropertiesMasthead(throwing(missing))).resolves.toBeNull();
  });

  it("rethrows a missing REPOSITORY instead of reading it as a missing photo", async () => {
    // RepositoryNotFoundError extends NotFoundError, so the `instanceof
    // NotFoundError` arm below would swallow a misconfigured repository name
    // and ship the gradient on a site whose CMS is not connected at all.
    const wrongRepo = new RepositoryNotFoundError("repository not found", "/api/v2", undefined);
    expect(wrongRepo).toBeInstanceOf(NotFoundError);
    await expect(loadPropertiesMasthead(throwing(wrongRepo))).rejects.toBe(wrongRepo);
  });

  it("lets every other failure stay loud", async () => {
    // A 5xx or a network fault must fail the prerender, not bake a gradient in.
    const boom = new Error("502");
    await expect(loadPropertiesMasthead(throwing(boom))).rejects.toBe(boom);
  });
});
