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
});
