import { describe, expect, it } from "vitest";
import { isNetlifyMirrorHost, MIRROR_ROBOTS_TAG } from "./indexability";

// The predicate is "this host is a netlify.app host", NEVER "this host is not
// <client domain>" — so it cannot match the client's real domain, needs no
// edit at DNS cutover, and keeps protecting the mirror after launch (#140).
describe("isNetlifyMirrorHost", () => {
  it("matches the site's own netlify.app host", () => {
    expect(isNetlifyMirrorHost("reddoor-wireframer.netlify.app")).toBe(true);
  });

  it("matches branch deploys and deploy previews", () => {
    expect(isNetlifyMirrorHost("staging--reddoor-wireframer.netlify.app")).toBe(true);
    expect(isNetlifyMirrorHost("deploy-preview-12--reddoor-wireframer.netlify.app")).toBe(true);
  });

  it("is case-insensitive and tolerates a trailing root dot", () => {
    expect(isNetlifyMirrorHost("Reddoor-Wireframer.Netlify.App")).toBe(true);
    expect(isNetlifyMirrorHost("reddoor-wireframer.netlify.app.")).toBe(true);
  });

  it("never matches a production domain", () => {
    for (const host of ["29navy.com", "www.example.com", "localhost", "127.0.0.1", ""]) {
      expect(isNetlifyMirrorHost(host), host).toBe(false);
    }
  });

  it("matches on a whole label, not a substring", () => {
    // Someone else's domain that merely CONTAINS the string must stay indexable.
    expect(isNetlifyMirrorHost("netlify.app.example.com")).toBe(false);
    expect(isNetlifyMirrorHost("notnetlify.app")).toBe(false);
    expect(isNetlifyMirrorHost("mynetlify.app")).toBe(false);
  });

  it("tells crawlers neither to index nor to follow", () => {
    expect(MIRROR_ROBOTS_TAG).toBe("noindex, nofollow");
  });
});
