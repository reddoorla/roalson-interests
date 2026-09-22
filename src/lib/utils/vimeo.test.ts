import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkVimeoVideo, parseVimeoId } from "./vimeo";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkVimeoVideo", () => {
  it("returns false for an empty ID without hitting the network", async () => {
    expect(await checkVimeoVideo("")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true when oEmbed responds ok", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    expect(await checkVimeoVideo("76979871")).toBe(true);
  });

  it("returns false when oEmbed responds non-ok", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await checkVimeoVideo("76979871")).toBe(false);
  });

  it("returns false when fetch throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await checkVimeoVideo("76979871")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("URL-encodes the video ID inside the oEmbed url param", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await checkVimeoVideo("123/unlisted&hash");
    const requested = fetchMock.mock.calls[0][0] as string;
    const url = new URL(requested);
    // The decoded param must round-trip the full inner URL — an unencoded
    // "&" would have split it into a second query param.
    expect(url.searchParams.get("url")).toBe("https://vimeo.com/123/unlisted&hash");
  });
});

// `vimeo_id` is a free-text CMS field whose value ends up inside an iframe
// `src`, so what matters is not only "does a URL work" but "what CANNOT come
// out of here". Every case below is an editor's realistic paste or an outright
// attack, and the invariant is the same: digits, or null.
describe("parseVimeoId", () => {
  it("passes a bare id through — the shape the field's placeholder asks for", () => {
    expect(parseVimeoId("1229048743")).toBe("1229048743");
    expect(parseVimeoId("  1229048743  ")).toBe("1229048743");
  });

  it("takes the id out of every URL an editor actually copies", () => {
    for (const raw of [
      "https://vimeo.com/1229048743",
      "http://vimeo.com/1229048743",
      "vimeo.com/1229048743",
      "https://www.vimeo.com/1229048743",
      "https://player.vimeo.com/video/1229048743",
      "https://vimeo.com/1229048743?share=copy",
      "https://vimeo.com/1229048743#t=2s",
      // An unlisted video's share URL carries a privacy hash after the id.
      "https://vimeo.com/1229048743/a1b2c3d4e5",
    ]) {
      expect(parseVimeoId(raw), raw).toBe("1229048743");
    }
  });

  it("returns null for an empty, absent or non-string field", () => {
    expect(parseVimeoId("")).toBeNull();
    expect(parseVimeoId("   ")).toBeNull();
    expect(parseVimeoId(null)).toBeNull();
    expect(parseVimeoId(undefined)).toBeNull();
    expect(parseVimeoId(1229048743 as unknown as string)).toBeNull();
  });

  it("refuses lookalike hosts on both sides of vimeo.com", () => {
    expect(parseVimeoId("https://evilvimeo.com/1229048743")).toBeNull();
    expect(parseVimeoId("https://vimeo.com.evil.test/1229048743")).toBeNull();
    expect(parseVimeoId("https://vimeo.evil.com/1229048743")).toBeNull();
  });

  it("returns null rather than a string that would change the embed URL", () => {
    // Each of these would otherwise be interpolated straight into the `src`.
    expect(parseVimeoId("1229048743?autoplay=1&muted=0")).toBeNull();
    expect(parseVimeoId("1229048743/../../evil")).toBeNull();
    expect(parseVimeoId("//evil.test/video/1")).toBeNull();
    expect(parseVimeoId('1"></iframe><script>alert(1)</script>')).toBeNull();
    expect(parseVimeoId("ask marketing for it")).toBeNull();
  });

  // The guarantee callers rely on to interpolate without escaping. Stated as
  // its own case because it is the reason the function exists.
  it("only ever returns digits", () => {
    const inputs = [
      "1229048743",
      "https://vimeo.com/1229048743/a1b2c3d4e5",
      "1229048743?autoplay=1",
      "nonsense",
      "",
    ];
    for (const raw of inputs) {
      const out = parseVimeoId(raw);
      if (out !== null) expect(out, raw).toMatch(/^\d+$/);
    }
  });
});
