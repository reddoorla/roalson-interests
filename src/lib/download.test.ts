import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveOnClick } from "./download";

const URL_ = "https://roalson-interests.cdn.prismic.io/roalson-interests/abc_package.pdf";

function press(init: MouseEventInit = {}) {
  const link = document.createElement("a");
  link.href = URL_;
  document.body.append(link);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  link.addEventListener("click", saveOnClick("5930 Bandera Road package.pdf"));
  link.dispatchEvent(event);
  return { link, event };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("saveOnClick", () => {
  let saved: { href: string; download: string }[];
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saved = [];
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ href: this.getAttribute("href")!, download: this.download });
    });
    assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("fetches the file and saves it from a blob under the given name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["%PDF"]), { status: 200 })),
    );
    const { event } = press();
    expect(event.defaultPrevented).toBe(true);
    await settle();
    await settle();
    expect(fetch).toHaveBeenCalledWith(URL_);
    expect(saved).toEqual([{ href: "blob:x", download: "5930 Bandera Road package.pdf" }]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("saves once however often it is pressed while the fetch is in flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["%PDF"]), { status: 200 })),
    );
    const link = document.createElement("a");
    link.href = URL_;
    document.body.append(link);
    link.addEventListener("click", saveOnClick("p.pdf"));
    const click = () =>
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    click();
    expect(link.getAttribute("aria-busy")).toBe("true");
    click();
    await settle();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
    expect(link.hasAttribute("aria-busy")).toBe(false);
  });

  it("goes to the file when the fetch fails, so a press never does nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    press();
    await settle();
    await settle();
    expect(saved).toEqual([]);
    expect(assign).toHaveBeenCalledWith(URL_);
  });

  it("leaves a modified or non-primary click to the browser", () => {
    vi.stubGlobal("fetch", vi.fn());
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const { event } = press(init);
      expect(event.defaultPrevented, JSON.stringify(init)).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
