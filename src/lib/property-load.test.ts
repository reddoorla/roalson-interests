// @vitest-environment node
//
// Node, not jsdom: the #176 case imports the real svelte.config.js, whose
// adapter pulls in esbuild, which refuses to load under jsdom (see
// scripts/csp-policy.test.ts). Nothing else here touches a DOM.
import { describe, expect, it } from "vitest";
import { NotFoundError, RepositoryNotFoundError } from "@prismicio/client";

import { loadProperty, type PropertyClient } from "./property-load";
import { propertyFixture } from "./property-fixture";

const url = new URL("https://www.roalson.com/properties/25331-ih-10-west");
const clientThat = (behaviour: () => Promise<unknown>) =>
  ({ getByUID: behaviour }) as unknown as PropertyClient;

describe("loadProperty", () => {
  it("asks for a property, not a page, and returns it with its head payload", async () => {
    const asked: string[] = [];
    const client = {
      getByUID: async (type: string, uid: string) => {
        asked.push(`${type}/${uid}`);
        return propertyFixture({ status: "Sold" });
      },
    } as unknown as PropertyClient;
    const data = await loadProperty(client, "25331-ih-10-west", url);
    expect(asked).toEqual(["property/25331-ih-10-west"]);
    expect(data).toMatchObject({ title: "25331 IH 10 West", noindex: true });
    expect(data.property.uid).toBe("25331-ih-10-west");
  });

  it("404s an archived listing, which has no page anywhere", async () => {
    const client = clientThat(async () => propertyFixture({ listing_state: "Archived" }));
    await expect(loadProperty(client, "25331-ih-10-west", url)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("keeps a past project's page, noindexed", async () => {
    const client = clientThat(async () => propertyFixture({ listing_state: "Past project" }));
    expect(await loadProperty(client, "25331-ih-10-west", url)).toMatchObject({ noindex: true });
  });

  it("turns a Prismic miss into a 404", async () => {
    const client = clientThat(async () => {
      throw new NotFoundError("No documents were returned", "https://x", undefined);
    });
    await expect(loadProperty(client, "gone", url)).rejects.toMatchObject({ status: 404 });
  });

  it("rethrows a wrong repository name instead of calling it a 404", async () => {
    const wrongRepo = new RepositoryNotFoundError("Repository not found", "https://x", undefined);
    const client = clientThat(async () => {
      throw wrongRepo;
    });
    await expect(loadProperty(client, "x", url)).rejects.toBe(wrongRepo);
  });

  // #176: the build's crawler follows a link to an archived listing, this
  // loader 404s it, and svelte.config.js's handleHttpError — which sees only
  // a status and a path — must say which listing and why, not a bare 404.
  it("lets the build's 404 handler name an archived listing that a page still links to", async () => {
    const { default: config } = await import("../../svelte.config.js");
    const handle = config.kit!.prerender!.handleHttpError as (details: {
      path: string;
      status: number;
      message: string;
      referrer: string | null;
      referenceType: "linked" | "fetched";
    }) => void;
    const details = (uid: string) => ({
      path: `/properties/${uid}`,
      status: 404,
      message: `404 /properties/${uid} (linked from /)`,
      referrer: "/",
      referenceType: "linked" as const,
    });
    const archived = clientThat(async () => propertyFixture({ listing_state: "Archived" }));
    await expect(loadProperty(archived, "archived-176", url)).rejects.toMatchObject({
      status: 404,
    });
    expect(() => handle(details("archived-176"))).toThrow(
      /"archived-176" is set to Archived in Prismic .* and \/ still links to it/,
    );
    // A 404 the loader never saw archived stays the plain one.
    expect(() => handle(details("never-archived-176"))).toThrow(
      /^404 \/properties\/never-archived-176 \(linked from \/\): 404/,
    );
  });
});
