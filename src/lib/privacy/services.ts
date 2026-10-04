export type SourceFile = { path: string; text: string };

export type CspDirectives = Record<string, unknown>;

export type EmbedService = "vimeo" | "youtube";
export type FontService = "googleFonts" | "adobeFonts";

export type BuildServices = Record<EmbedService | FontService, boolean> & {
  forms: boolean;
  newsletter: boolean;
  ga4: boolean;
  netlify: boolean;
};

export type PrivacyServices = BuildServices & { turnstile: boolean };

export const SERVICE_HOSTS: Record<EmbedService | FontService, string[]> = {
  vimeo: ["player.vimeo.com"],
  youtube: ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com"],
  googleFonts: ["fonts.googleapis.com", "fonts.gstatic.com"],
  adobeFonts: ["use.typekit.net", "p.typekit.net"],
};

const ANALYTICS_PATTERNS = [
  /(?<!function\s+)\binitAnalytics\s*\(/,
  /googletagmanager\.com\/(gtag\/js|gtm\.js)/,
  /\bgtag\s*\(\s*["']config["']/,
];

function maskScript(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const c = source[i];
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < source.length) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (c === quote || (c === "\n" && quote !== "`")) quote = null;
      i++;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith("//", i) && !/[:(]/.test(source[i - 1] ?? "")) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    out += c;
    i++;
  }
  return out;
}

export function maskComments(source: string, path = "file.ts"): string {
  if (path.endsWith(".css")) return source.replace(/\/\*[\s\S]*?(\*\/|$)/g, "");
  const markupFree = /\.(svelte|html)$/.test(path)
    ? source.replace(/<!--[\s\S]*?(-->|$)/g, "")
    : source;
  return maskScript(markupFree);
}

export function startsAnalytics(code: string): boolean {
  return ANALYTICS_PATTERNS.some((p) => p.test(code));
}

function sourceHost(source: string): string | null {
  const s = source.replace(/^'|'$/g, "").toLowerCase();
  if (s === "*" || s === "https:" || s === "http:") return "*";
  const m =
    /^(?:[a-z][a-z0-9+.-]*:\/\/)?(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d+|:\*)?(?:\/.*)?$/.exec(
      s,
    );
  if (!m) return null;
  return (m[1] ?? "") + m[2];
}

export const CSP_FALLBACK: Record<EmbedService | FontService, string[]> = {
  vimeo: ["frame-src", "child-src", "default-src"],
  youtube: ["frame-src", "child-src", "default-src"],
  googleFonts: ["style-src", "default-src"],
  adobeFonts: ["style-src", "default-src"],
};

function listAdmits(value: unknown[], host: string): boolean {
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const h = sourceHost(entry);
    if (h === null) continue;
    if (h === "*" || h === host) return true;
    if (h.startsWith("*.") && host.endsWith(h.slice(1))) return true;
  }
  return false;
}

export function cspAdmits(directives: CspDirectives, host: string, fallback: string[]): boolean {
  const name = fallback.find((d) => Array.isArray(directives[d]));
  return name !== undefined && listAdmits(directives[name] as unknown[], host);
}

export function deriveBuildServices(input: {
  csp: CspDirectives | null;
  adapterName?: string;
  sources: SourceFile[];
}): BuildServices {
  const code = input.sources.map((s) => maskComments(s.text, s.path));
  const named = (service: EmbedService | FontService) =>
    code.some((c) => SERVICE_HOSTS[service].some((h) => c.includes(h)));
  const admitted = (service: EmbedService | FontService) =>
    input.csp !== null &&
    SERVICE_HOSTS[service].some((h) => cspAdmits(input.csp!, h, CSP_FALLBACK[service]));
  const embed = (service: EmbedService) =>
    input.csp === null ? named(service) : admitted(service);
  const font = (service: FontService) =>
    named(service) && (input.csp === null || admitted(service));
  const ingest = code.filter((c) => /\bcreateIngest(Action|Endpoint)\s*\(/.test(c));

  return {
    forms: ingest.length > 0,
    newsletter: ingest.length > 0 && code.some((c) => /["'`]newsletter["'`]/.test(c)),
    ga4: code.some(startsAnalytics),
    netlify: input.adapterName === "@sveltejs/adapter-netlify",
    vimeo: embed("vimeo"),
    youtube: embed("youtube"),
    googleFonts: font("googleFonts"),
    adobeFonts: font("adobeFonts"),
  };
}

export function withRuntime(
  build: BuildServices,
  runtime: { turnstileSiteKey?: string },
): PrivacyServices {
  return { ...build, turnstile: build.forms && !!runtime.turnstileSiteKey?.trim() };
}
