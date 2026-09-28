import { describe, expect, it } from "vitest";
import { NotFoundError, RepositoryNotFoundError } from "@prismicio/client";

import { loadPerson, type PersonClient } from "./person-load";
import { personFixture } from "./person-fixture";

const url = new URL("https://www.roalson.com/team/matt-howard");
const clientThat = (behaviour: () => Promise<unknown>) =>
  ({ getByUID: behaviour }) as unknown as PersonClient;

describe("loadPerson", () => {
  it("asks for a person, not a page, and returns it with its head payload", async () => {
    const asked: string[] = [];
    const client = {
      getByUID: async (type: string, uid: string) => {
        asked.push(`${type}/${uid}`);
        return personFixture();
      },
    } as unknown as PersonClient;
    const data = await loadPerson(client, "matt-howard", url);
    expect(asked).toEqual(["person/matt-howard"]);
    expect(data).toMatchObject({ title: "Matt Howard", noindex: true });
    expect(data.person.uid).toBe("matt-howard");
  });

  it("turns a Prismic miss into a 404", async () => {
    const client = clientThat(async () => {
      throw new NotFoundError("No documents were returned", "https://x", undefined);
    });
    await expect(loadPerson(client, "gone", url)).rejects.toMatchObject({ status: 404 });
  });

  it("rethrows a wrong repository name instead of calling it a 404", async () => {
    const wrongRepo = new RepositoryNotFoundError("Repository not found", "https://x", undefined);
    const client = clientThat(async () => {
      throw wrongRepo;
    });
    await expect(loadPerson(client, "x", url)).rejects.toBe(wrongRepo);
  });
});
