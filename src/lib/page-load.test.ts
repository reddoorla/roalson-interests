import { describe, expect, it } from "vitest";
import { NotFoundError, RepositoryNotFoundError } from "@prismicio/client";

import { loadPage, type PageClient } from "./page-load";

const doc = {
  uid: "about",
  type: "page",
  data: { title: [{ type: "heading1", text: "About", spans: [] }], slices: [] },
} as never;

const clientThat = (behaviour: () => Promise<never> | Promise<typeof doc>) =>
  ({ getByUID: behaviour }) as unknown as PageClient;

describe("loadPage", () => {
  it("returns the document plus its head payload", async () => {
    const client = clientThat(async () => doc);
    await expect(loadPage(client, "about")).resolves.toMatchObject({
      page: doc,
      title: "About",
    });
  });

  it("asks for every linked field the slices embed, the partners' Persons included (#179)", async () => {
    const calls: unknown[][] = [];
    const client = {
      getByUID: async (...args: unknown[]) => {
        calls.push(args);
        return doc;
      },
    } as unknown as PageClient;
    await loadPage(client, "home");
    expect(calls).toHaveLength(1);
    const [type, uid, params] = calls[0] as [string, string, { fetchLinks: string[] }];
    expect([type, uid]).toEqual(["page", "home"]);
    expect(params.fetchLinks).toEqual(
      expect.arrayContaining(["person.name", "person.role", "person.photo", "person.email"]),
    );
    // …and the featured band's, which a person-only list would have emptied.
    expect(params.fetchLinks).toEqual(expect.arrayContaining(["property.feature_image"]));
  });

  it("turns a Prismic miss into a 404", async () => {
    const client = clientThat(async () => {
      throw new NotFoundError("No documents were returned", "https://x", undefined);
    });
    await expect(loadPage(client, "missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rethrows anything that is not a miss so outages stay loud", async () => {
    const boom = new Error("ECONNRESET");
    const client = clientThat(async () => {
      throw boom;
    });
    await expect(loadPage(client, "about")).rejects.toBe(boom);
  });

  it("rethrows a wrong repository name instead of calling it a 404", async () => {
    const wrongRepo = new RepositoryNotFoundError("Repository not found", "https://x", undefined);
    const client = clientThat(async () => {
      throw wrongRepo;
    });
    await expect(loadPage(client, "about")).rejects.toBe(wrongRepo);
  });
});
