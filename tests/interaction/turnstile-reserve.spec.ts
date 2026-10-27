import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { expect, test } from "@playwright/test";
import { readGateServer } from "@reddoorla/maintenance/configs/playwright-a11y";

// The contact form's Turnstile widget must not shove the submit button when it
// arrives. api.js resolves at a moment nobody controls and Cloudflare's iframe
// is ~65px tall, so without a reserved box everything below the widget, the
// submit button included, drops out from under a visitor about to click it.
//
// The widget is dark until PUBLIC_TURNSTILE_SITE_KEY is set, and the shared
// gate server runs without one, so this spec starts its OWN server with a
// sitekey, of the same kind the gate uses (`vite preview` over the build the
// gate made, or `vite dev`). api.js is stubbed: no request reaches Cloudflare,
// and the stub is held until the test has measured the form without the
// widget, then released so the "iframe" lands mid-visit.
//
// The assertion is relative, not a design value: the button's own top before
// the widget renders equals its top after. getBoundingClientRect forces
// layout, so each read is settled; nothing here waits on a frame.
//
// Replaces the jsdom check that the mount carried a `min-h-` class token
// (fleet test audit, 2026-10-26: `turnstile-no-reserved-height`).

const SITEKEY = "1x00000000000000000000AA"; // Cloudflare's documented always-pass test key
const WIDGET_HEIGHT = 65; // Cloudflare's widget, not ours: the box being reserved

let server: ChildProcess | undefined;
let base = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const port = await freePort();
  const preview = (process.env.REDDOOR_GATE_SERVER ?? readGateServer(process.cwd())) === "preview";
  server = spawn(
    "node_modules/.bin/vite",
    [preview ? "preview" : "dev", "--port", String(port), "--strictPort"],
    {
      env: { ...process.env, PUBLIC_TURNSTILE_SITE_KEY: SITEKEY },
      stdio: "ignore",
      detached: true,
    },
  );
  base = `http://localhost:${port}`;
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${base}/contact`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 150_000, intervals: [500] },
    )
    .toBe(200);
});

test.afterAll(() => {
  if (server?.pid) process.kill(-server.pid, "SIGTERM");
});

test(
  "the submit button stays put when the Turnstile widget renders",
  { tag: "@smoke" },
  async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let requested!: () => void;
    const asked = new Promise<void>((r) => (requested = r));

    await page.route("https://challenges.cloudflare.com/**", async (route) => {
      requested();
      await held;
      await route.fulfill({
        contentType: "application/javascript",
        body: `window.turnstile = {
        render(el) {
          const w = document.createElement("div");
          w.setAttribute("data-stub-widget", "");
          w.style.height = "${WIDGET_HEIGHT}px";
          w.style.width = "300px";
          el.appendChild(w);
          return "stub-1";
        },
        remove() {},
        reset() {},
      };`,
      });
    });

    // Not "load": the held api.js is a script the page is still fetching, and
    // a script inserted before load holds the load event until it arrives.
    await page.goto(`${base}/contact`, { waitUntil: "domcontentloaded" });
    const form = page.locator("form:has(.cf-turnstile)");
    await expect(form).toHaveCount(1);
    // Positive evidence the widget's effect ran: it asked for api.js.
    await asked;

    const submitTop = () =>
      form
        .getByRole("button", { name: "Send message" })
        .evaluate((b) => b.getBoundingClientRect().top + window.scrollY);

    const before = await submitTop();
    release();
    await expect(form.locator("[data-stub-widget]")).toHaveCount(1);
    expect(await submitTop()).toBe(before);
  },
);
