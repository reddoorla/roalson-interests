/** Netlify's URL at build time, or null (vite.config.ts `define`). */
declare const __REDDOOR_SITE_ORIGIN__: string | null;

interface VimeoPlayer {
  on(event: string, callback: () => void): void;
  ready(): Promise<void>;
  setQuality(quality: string): Promise<string>;
  destroy(): Promise<void>;
}

interface Window {
  Vimeo?: { Player: new (el: HTMLIFrameElement) => VimeoPlayer };
}
