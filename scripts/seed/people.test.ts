import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { toPayload } from "./people.mjs";
import { imageRefs } from "./pages.mjs";
import { stagedByType } from "./publish-release.mjs";

type Person = { uid: string; data: Record<string, unknown>; source: Record<string, string> };

const read = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
const people = read("scripts/seed/people.json") as Person[];
const model = read("customtypes/person/index.json");
const fields: Record<string, { type: string }> = Object.assign(
  {},
  ...Object.values(model.json as Record<string, object>),
);

describe("the people data file", () => {
  it("holds the two partners, each with a source for every field", () => {
    expect(people.map((p) => p.uid)).toEqual(["matt-howard", "bart-wilson"]);
    for (const p of people) {
      expect(Object.keys(p.source).sort(), p.uid).toEqual(Object.keys(p.data).sort());
      for (const note of Object.values(p.source)) expect(note).toMatch(/^(MEASURED|INFERRED) — /);
    }
  });

  it("uses only fields the person model declares — the API drops the rest without a word", () => {
    const unknown = people.flatMap((p) => Object.keys(p.data).filter((k) => !fields[k]));
    expect(unknown).toEqual([]);
  });

  it("carries each partner's own biography, and seeds no mobile or license number (D4)", () => {
    for (const p of people) {
      expect(p.data.bio_is_placeholder, p.uid).toBe(false);
      expect(JSON.stringify(p.data.bio), p.uid).not.toMatch(/placeholder/i);
      expect(p.data.license, p.uid).toBeUndefined();
      expect(p.data.phone, p.uid).toBe("(210) 496-5800");
    }
  });

  it("is the only place a partner's headshot is written — the home rows link the Person (#179)", () => {
    const pages = read("scripts/seed/pages.json");
    const band = pages[0].data.slices.find(
      (s: { slice_type: string }) => s.slice_type === "partners",
    );
    expect(imageRefs(band)).toEqual([]);
    expect(people.flatMap((p) => imageRefs(p.data))).toEqual([
      "Matt_Howard_Headshot_NO_GPS.png",
      "partner-bart-wilson-headshot.png",
    ]);
  });

  it("stages the name as the document title and resolves the headshot to its asset id", () => {
    const payload = toPayload(people[0], { "Matt_Howard_Headshot_NO_GPS.png": { id: "A1" } });
    expect(payload).toMatchObject({ type: "person", uid: "matt-howard", title: "Matt Howard" });
    expect(payload.data.photo).toEqual({ id: "A1" });
    expect(() => toPayload(people[0], {})).toThrow(/no asset in the media library/);
  });
});

describe("publish-release", () => {
  it("reads people.state.json as the person type", () => {
    const dir = mkdtempSync(join(tmpdir(), "staged-"));
    const documents = { "matt-howard": { id: "1", signature: "S" } };
    writeFileSync(join(dir, "people.state.json"), JSON.stringify({ documents, assets: {} }));
    expect(stagedByType(dir)).toEqual({ person: documents });
  });
});
