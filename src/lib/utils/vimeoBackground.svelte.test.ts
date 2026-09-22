import { describe, expect, it, vi } from "vitest";
import { backgroundEmbedSrc, VimeoBackground, VIMEO_PLAYER_ORIGIN } from "./vimeoBackground.svelte";

// The controller is exercised end to end through its two renderings
// (VimeoBanner.test.ts and HeroBackgroundVideo.test.ts, 18 cases between them).
// What is here is the part neither of those can state plainly: the embed URL's
// own parameters, and the algebra of `visible` / `controllable`, which is what
// decides whether a page shows motion and whether it offers a way to stop it.

describe("backgroundEmbedSrc", () => {
  it("asks for the chrome-less, muted, looping, do-not-track embed", () => {
    const url = new URL(backgroundEmbedSrc("1229048743"));
    expect(url.origin).toBe(VIMEO_PLAYER_ORIGIN);
    expect(url.pathname).toBe("/video/1229048743");
    // Each of these is load-bearing: `background=1` removes the controls (which
    // is why the iframe is never a tab stop), `muted=1` is the only autoplay a
    // browser will honour AND the difference between this and a WCAG 1.4.2
    // failure, `loop=1` is why 2.2.2 applies, `dnt=1` is the privacy ask.
    expect(Object.fromEntries(url.searchParams)).toEqual({
      background: "1",
      muted: "1",
      loop: "1",
      autoplay: "1",
      dnt: "1",
    });
  });

  it("encodes the id, so a stray character cannot bolt a parameter on", () => {
    const url = new URL(backgroundEmbedSrc("123?muted=0"));
    expect(url.pathname).toBe("/video/123%3Fmuted%3D0");
    expect(url.searchParams.get("muted")).toBe("1");
  });
});

describe("VimeoBackground", () => {
  it("shows nothing until it is mounted AND beating", () => {
    const v = new VimeoBackground();
    expect(v.visible).toBe(false);
    v.mounted = true;
    expect(v.visible, "mounted but never played").toBe(false);
    v.beating = true;
    expect(v.visible).toBe(true);
  });

  it("offers no control until a beat has been seen, and never withdraws it after", () => {
    const v = new VimeoBackground();
    v.mounted = true;
    expect(v.controllable, "an iframe that has not played yet").toBe(false);
    v.offered = true;
    v.beating = true;
    expect(v.controllable).toBe(true);
    // The beat stopping (iOS suspension, or the visitor's own pause) hides the
    // video but must not take the control away under the pointer.
    v.beating = false;
    expect(v.visible).toBe(false);
    expect(v.controllable).toBe(true);
  });

  it("hides the video itself on pause, not only by asking the player", () => {
    const v = new VimeoBackground();
    const posted: string[] = [];
    const iframe = {
      contentWindow: { postMessage: (data: string) => posted.push(data) },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLIFrameElement;
    const stop = v.watch(iframe);
    v.mounted = true;
    v.beating = true;
    v.offered = true;

    v.toggle();
    expect(v.paused).toBe(true);
    expect(JSON.parse(posted.at(-1)!).method).toBe("pause");
    // The half we control. "Pause, stop, or hide" is satisfied here even if the
    // cross-origin player never acts on the message.
    expect(v.visible).toBe(false);

    v.toggle();
    expect(JSON.parse(posted.at(-1)!).method).toBe("play");
    expect(v.visible).toBe(true);
    stop();
  });
});
