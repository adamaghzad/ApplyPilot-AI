/**
 * Job source adapters.
 *
 * IMPORTANT — compliance by design:
 * This module only talks to *public, documented* job-board APIs or to endpoints the
 * workspace owner has credentials for. It never attempts to bypass a login wall,
 * CAPTCHA, rate limiter or any anti-bot protection. LinkedIn and Indeed require an
 * authorised API credential (partner / publisher programme); without one the adapter
 * reports itself as unavailable instead of scraping.
 */

const TIMEOUT_MS = 12_000;

export type RawListing = {
  title: string;
  company: string;
  location: string | null;
  remote: "REMOTE" | "HYBRID" | "ONSITE";
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP";
  description: string;
  url: string;
  applyUrl: string | null;
  postedAt: Date | null;
  source: "GREENHOUSE" | "LEVER" | "WTTJ" | "LINKEDIN" | "INDEED" | "CAREERS_PAGE";
  externalId: string | null;
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  department: string | null;
};

export type AdapterResult = {
  listings: RawListing[];
  status: "ok" | "unavailable" | "error";
  reason?: string;
  fetched: number;
};

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function detectRemote(text: string, location: string | null): "REMOTE" | "HYBRID" | "ONSITE" {
  const haystack = `${text} ${location ?? ""}`.toLowerCase();
  if (/(fully remote|100% remote|remote-first|full remote|full-remote|télétravail complet)/.test(haystack)) return "REMOTE";
  if (/hybrid|hybride/.test(haystack)) return "HYBRID";
  if (/remote/.test(haystack)) return "REMOTE";
  return "ONSITE";
}

function detectEmploymentType(text: string): RawListing["employmentType"] {
  const haystack = text.toLowerCase();
  if (/intern|stage|stagiaire/.test(haystack)) return "INTERNSHIP";
  if (/part[- ]time|temps partiel/.test(haystack)) return "PART_TIME";
  if (/contract|freelance|cdd|mission/.test(haystack)) return "CONTRACT";
  return "FULL_TIME";
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ───────────────────────────── Greenhouse ─────────────────────────────

type GreenhouseJob = {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  content?: string;
  absolute_url?: string;
  location?: { name?: string };
  metadata?: { value?: string; name?: string }[];
  departments?: { name?: string }[];
  offices?: { name?: string }[];
};

/** Public Greenhouse job board API — https://boards-api.greenhouse.io/v1/boards/{token}/jobs */
export async function greenhouse(boardToken: string): Promise<AdapterResult> {
  const token = slugify(boardToken);
  try {
    const data = await getJson<{ jobs?: GreenhouseJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    );
    const jobs = data.jobs ?? [];
    return {
      status: "ok",
      fetched: jobs.length,
      listings: jobs.map((job) => {
        const description = stripHtml(job.content ?? "");
        const location = job.location?.name ?? job.offices?.[0]?.name ?? null;
        return {
          title: job.title,
          company: token,
          location,
          remote: detectRemote(description, location),
          employmentType: detectEmploymentType(`${job.title} ${description}`),
          description,
          url: job.absolute_url ?? `https://boards.greenhouse.io/${token}/jobs/${job.id}`,
          applyUrl: job.absolute_url ?? `https://boards.greenhouse.io/${token}/jobs/${job.id}`,
          postedAt: job.first_published ? new Date(job.first_published) : job.updated_at ? new Date(job.updated_at) : null,
          source: "GREENHOUSE" as const,
          externalId: String(job.id),
          skills: [],
          salaryMin: null,
          salaryMax: null,
          department: job.departments?.[0]?.name ?? null,
        };
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason: `Greenhouse board "${token}" unreachable (${error instanceof Error ? error.message : "error"})`,
    };
  }
}

// ─────────────────────────────── Lever ────────────────────────────────

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; commitment?: string };
  descriptionPlain?: string;
  lists?: { text?: string; content?: string }[];
};

/** Public Lever postings API — https://api.lever.co/v0/postings/{company}?mode=json */
export async function lever(company: string): Promise<AdapterResult> {
  const slug = slugify(company);
  try {
    const data = await getJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
    const postings = Array.isArray(data) ? data : [];
    return {
      status: "ok",
      fetched: postings.length,
      listings: postings.map((posting) => {
        const description = posting.descriptionPlain ?? stripHtml((posting.lists ?? []).map((l) => `${l.text ?? ""}\n${l.content ?? ""}`).join("\n"));
        const location = posting.categories?.location ?? null;
        return {
          title: posting.text,
          company: slug,
          location,
          remote: detectRemote(description, location),
          employmentType: detectEmploymentType(`${posting.text} ${posting.categories?.commitment ?? ""} ${description}`),
          description,
          url: posting.hostedUrl ?? `https://jobs.lever.co/${slug}/${posting.id}`,
          applyUrl: posting.applyUrl ?? posting.hostedUrl ?? null,
          postedAt: posting.createdAt ? new Date(posting.createdAt) : null,
          source: "LEVER" as const,
          externalId: posting.id,
          skills: [],
          salaryMin: null,
          salaryMax: null,
          department: posting.categories?.team ?? null,
        };
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason: `Lever board "${slug}" unreachable (${error instanceof Error ? error.message : "error"})`,
    };
  }
}

// ───────────────────── Welcome to the Jungle ──────────────────────────

/** WTTJ public API. Requires `WTTJ_API_URL` (and `WTTJ_API_KEY` when provided by WTTJ). */
export async function welcomeToTheJungle(query: string, location?: string): Promise<AdapterResult> {
  const base = process.env.WTTJ_API_URL;
  if (!base) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason: "Welcome to the Jungle adapter not configured — set WTTJ_API_URL (see README → Job sources)",
    };
  }
  try {
    const url = new URL(base);
    url.searchParams.set("q", query);
    if (location) url.searchParams.set("l", location);
    const headers: Record<string, string> = {};
    if (process.env.WTTJ_API_KEY) headers.authorization = `Bearer ${process.env.WTTJ_API_KEY}`;
    const data = await getJson<{ jobs?: Record<string, unknown>[] }>(url.toString(), headers);
    const jobs = data.jobs ?? [];
    return {
      status: "ok",
      fetched: jobs.length,
      listings: jobs.map((job) => {
        const description = stripHtml(String(job.description ?? ""));
        const locationText = typeof job.location === "string" ? job.location : null;
        return {
          title: String(job.title ?? "Untitled role"),
          company: String(job.company ?? "Unknown"),
          location: locationText,
          remote: detectRemote(description, locationText),
          employmentType: detectEmploymentType(`${job.title ?? ""} ${description}`),
          description,
          url: String(job.url ?? ""),
          applyUrl: typeof job.applyUrl === "string" ? job.applyUrl : null,
          postedAt: job.postedAt ? new Date(String(job.postedAt)) : null,
          source: "WTTJ" as const,
          externalId: job.id ? String(job.id) : null,
          skills: Array.isArray(job.skills) ? (job.skills as string[]) : [],
          salaryMin: null,
          salaryMax: null,
          department: null,
        };
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason: `Welcome to the Jungle unreachable (${error instanceof Error ? error.message : "error"})`,
    };
  }
}

// ─────────────────────── LinkedIn (authorised API) ────────────────────

/**
 * LinkedIn is only queried through an *authorised* API credential (LinkedIn Talent
 * Solutions / Jobs partner programme). Without `LINKEDIN_ACCESS_TOKEN` this adapter
 * returns `unavailable` — ApplyPilot never scrapes LinkedIn.
 */
export async function linkedIn(query: { keywords: string[]; locations: string[] }): Promise<AdapterResult> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason:
        "LinkedIn requires an authorised API credential — set LINKEDIN_ACCESS_TOKEN (partner API). Scraping is deliberately not supported.",
    };
  }
  try {
    const url = new URL(process.env.LINKEDIN_API_BASE ?? "https://api.linkedin.com/v2/jobSearch");
    url.searchParams.set("keywords", query.keywords.join(" "));
    if (query.locations.length) url.searchParams.set("locationFallback", query.locations.join(", "));
    const data = await getJson<{ elements?: Record<string, unknown>[] }>(url.toString(), {
      authorization: `Bearer ${token}`,
    });
    const elements = data.elements ?? [];
    return {
      status: "ok",
      fetched: elements.length,
      listings: elements.map((element) => {
        const description = stripHtml(String(element.description ?? ""));
        const locationText = typeof element.location === "string" ? element.location : null;
        return {
          title: String(element.title ?? "Untitled role"),
          company: String(element.companyName ?? "Unknown"),
          location: locationText,
          remote: detectRemote(description, locationText),
          employmentType: detectEmploymentType(`${element.title ?? ""} ${description}`),
          description,
          url: String(element.jobPostingUrl ?? ""),
          applyUrl: typeof element.applyUrl === "string" ? element.applyUrl : null,
          postedAt: element.listedAt ? new Date(Number(element.listedAt)) : null,
          source: "LINKEDIN" as const,
          externalId: element.id ? String(element.id) : null,
          skills: [],
          salaryMin: null,
          salaryMax: null,
          department: null,
        };
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason: `LinkedIn API error (${error instanceof Error ? error.message : "error"})`,
    };
  }
}

// ─────────────────────── Indeed (publisher API) ───────────────────────

/** Indeed is queried through the publisher API; scraping is deliberately unsupported. */
export async function indeed(query: { keywords: string[]; locations: string[] }): Promise<AdapterResult> {
  const publisherId = process.env.INDEED_PUBLISHER_ID;
  if (!publisherId) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason: "Indeed requires a publisher API key — set INDEED_PUBLISHER_ID (see README → Job sources)",
    };
  }
  try {
    const url = new URL("https://api.indeed.com/ads/apisearch");
    url.searchParams.set("publisher", publisherId);
    url.searchParams.set("q", query.keywords.join(" "));
    url.searchParams.set("l", query.locations.join(", "));
    url.searchParams.set("format", "json");
    url.searchParams.set("v", "2");
    const data = await getJson<{ results?: Record<string, unknown>[] }>(url.toString());
    const results = data.results ?? [];
    return {
      status: "ok",
      fetched: results.length,
      listings: results.map((result) => {
        const description = stripHtml(String(result.snippet ?? ""));
        return {
          title: String(result.jobtitle ?? "Untitled role"),
          company: String(result.company ?? "Unknown"),
          location: typeof result.formattedLocation === "string" ? result.formattedLocation : null,
          remote: detectRemote(description, null),
          employmentType: detectEmploymentType(`${result.jobtitle ?? ""} ${description}`),
          description,
          url: String(result.url ?? ""),
          applyUrl: typeof result.url === "string" ? result.url : null,
          postedAt: result.date ? new Date(String(result.date)) : null,
          source: "INDEED" as const,
          externalId: typeof result.jobkey === "string" ? result.jobkey : null,
          skills: [],
          salaryMin: null,
          salaryMax: null,
          department: null,
        };
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      listings: [],
      fetched: 0,
      reason: `Indeed API error (${error instanceof Error ? error.message : "error"})`,
    };
  }
}

// ───────────────────────── Career pages ───────────────────────────────

/** Crawls a company's public careers page for job links (respecting robots-free public pages only). */
export async function careersPage(
  companyName: string,
  careersUrl: string,
  keywords: string[],
): Promise<AdapterResult> {
  const { fetchPage } = await import("./web");
  const page = await fetchPage(careersUrl);
  if (!page.ok) {
    return { status: "unavailable", listings: [], fetched: 0, reason: `Careers page unreachable (${page.error ?? "error"})` };
  }

  const jobLinks = page.links.filter((link) =>
    /\/(jobs?|careers?|offres?|positions?|opportunities|recrutement)\//i.test(link),
  );

  const matched = jobLinks.filter((link) => {
    const slug = link.toLowerCase().replace(/-/g, " ");
    return keywords.some((keyword) => slug.includes(keyword.toLowerCase()));
  });

  const selected = (matched.length ? matched : jobLinks).slice(0, 8);

  const listings: RawListing[] = [];
  for (const link of selected) {
    const detail = await fetchPage(link);
    if (!detail.ok) continue;
    const titleFromUrl = decodeURIComponent(link.split("/").filter(Boolean).pop() ?? "").replace(/[-_]/g, " ").trim();
    listings.push({
      title: detail.title ?? titleFromUrl ?? "Open position",
      company: companyName,
      location: null,
      remote: detectRemote(detail.text, null),
      employmentType: detectEmploymentType(detail.text.slice(0, 2000)),
      description: detail.text.slice(0, 8000),
      url: detail.url,
      applyUrl: detail.url,
      postedAt: null,
      source: "CAREERS_PAGE",
      externalId: null,
      skills: [],
      salaryMin: null,
      salaryMax: null,
      department: null,
    });
  }

  return { status: "ok", listings, fetched: listings.length };
}

export const ADAPTERS = { greenhouse, lever, welcomeToTheJungle, linkedIn, indeed, careersPage };
