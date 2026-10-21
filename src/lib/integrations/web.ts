import dns from "node:dns/promises";
import net from "node:net";

const USER_AGENT = "ApplyPilotBot/1.0 (+https://applypilot.ai/bot)";
const MAX_BYTES = 1_500_000;
const DEFAULT_TIMEOUT = 12_000;

export type FetchedPage = {
  url: string;
  status: number;
  ok: boolean;
  title?: string;
  text: string;
  emails: string[];
  links: string[];
  technologies: string[];
  error?: string;
};

/**
 * SSRF guard: blocks loopback, link-local, private and reserved addresses.
 * Public research targets only — the crawler must never touch internal networks.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new Error("Refusing to fetch internal host");
  }
  let records: { address: string; family: number }[] = [];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`DNS lookup failed for ${hostname}`);
  }
  for (const record of records) {
    const ip = record.address;
    if (record.family === 4) {
      const parts = ip.split(".").map(Number);
      if (
        parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        parts[0] === 127 ||
        parts[0] === 0 ||
        parts[0] >= 224
      ) {
        throw new Error(`Refusing to fetch private address ${ip}`);
      }
    } else if (ip === "::1" || ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd")) {
      throw new Error(`Refusing to fetch private address ${ip}`);
    }
  }
  if (net.isIP(hostname)) {
    throw new Error("Raw IP targets are not allowed");
  }
}

export function htmlToVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_NOISE = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?|ico)$/i;

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return Array.from(
    new Set(
      matches
        .map((email) => email.toLowerCase().replace(/^[.\-]+/, ""))
        .filter((email) => email.length <= 254 && !EMAIL_NOISE.test(email)),
    ),
  );
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") links.add(resolved.toString());
    } catch {
      /* ignore malformed hrefs */
    }
  }
  return Array.from(links);
}

const TECH_SIGNATURES: [string, RegExp][] = [
  ["Next.js", /_next\/|__NEXT_DATA__/i],
  ["React", /react(-dom)?[.@]|data-reactroot/i],
  ["Vue", /vue(\.runtime)?\.min\.js|__NUXT__/i],
  ["Nuxt", /__NUXT__/i],
  ["Angular", /ng-version|angular(\.min)?\.js/i],
  ["Svelte", /svelte-/i],
  ["WordPress", /wp-content|wp-includes/i],
  ["Shopify", /cdn\.shopify\.com/i],
  ["Webflow", /webflow\.(js|com)/i],
  ["Tailwind CSS", /tailwind/i],
  ["Segment", /cdn\.segment\.com|analytics\.js/i],
  ["HubSpot", /hs-scripts|hubspot/i],
  ["Salesforce", /salesforce|pardot/i],
  ["Greenhouse", /boards\.greenhouse\.io|greenhouse\.io\/embed/i],
  ["Lever", /jobs\.lever\.co|lever\.co\/embed/i],
  ["Workday", /myworkdayjobs|workday/i],
  ["SmartRecruiters", /smartrecruiters/i],
  ["Teamtailor", /teamtailor/i],
  ["Google Analytics", /googletagmanager|gtag\(|analytics\.js/i],
  ["Stripe", /js\.stripe\.com/i],
  ["Intercom", /intercom/i],
  ["Cloudflare", /cloudflare/i],
  ["AWS", /cloudfront\.net|aws\.amazon/i],
];

export function detectTechnologies(html: string, headers: Record<string, string> = {}): string[] {
  const haystack = `${html.slice(0, 400_000)} ${JSON.stringify(headers)}`;
  return TECH_SIGNATURES.filter(([, re]) => re.test(haystack)).map(([name]) => name);
}

export function titleFromHtml(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return match?.[1]?.trim();
}

/** Safe, size-limited, timeout-bounded page fetch used by the research agent. */
export async function fetchPage(rawUrl: string, options: { timeoutMs?: number } = {}): Promise<FetchedPage> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { url: rawUrl, status: 0, ok: false, text: "", emails: [], links: [], technologies: [], error: "Invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { url: rawUrl, status: 0, ok: false, text: "", emails: [], links: [], technologies: [], error: "Unsupported protocol" };
  }

  try {
    await assertPublicHost(url.hostname);
  } catch (error) {
    return {
      url: rawUrl,
      status: 0,
      ok: false,
      text: "",
      emails: [],
      links: [],
      technologies: [],
      error: error instanceof Error ? error.message : "Blocked",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en,fr;q=0.8",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      return { url: response.url || rawUrl, status: response.status, ok: false, text: "", emails: [], links: [], technologies: [], error: `HTTP ${response.status}` };
    }
    if (!/text\/html|text\/plain|application\/json/i.test(contentType)) {
      return { url: response.url || rawUrl, status: response.status, ok: false, text: "", emails: [], links: [], technologies: [], error: `Unsupported content type: ${contentType}` };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { url: response.url || rawUrl, status: response.status, ok: false, text: "", emails: [], links: [], technologies: [], error: "Response too large" };
    }

    const html = Buffer.from(buffer).toString("utf8");
    const text = htmlToVisibleText(html);
    return {
      url: response.url || rawUrl,
      status: response.status,
      ok: true,
      title: titleFromHtml(html),
      text,
      emails: extractEmails(text),
      links: extractLinks(html, response.url || rawUrl),
      technologies: detectTechnologies(html, Object.fromEntries(response.headers.entries())),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return { url: rawUrl, status: 0, ok: false, text: "", emails: [], links: [], technologies: [], error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/** Best-effort careers-page discovery for a company website. */
export function guessCareersUrl(website: string): string[] {
  const candidates = ["/careers", "/career", "/jobs", "/join-us", "/nous-rejoindre", "/recrutement", "/company/careers", "/about/careers"];
  return candidates.map((path) => new URL(path, website).toString());
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
