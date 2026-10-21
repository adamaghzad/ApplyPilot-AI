import { complete, isAIUnavailable } from "../client";
import { PROMPT, SYSTEM } from "../prompts";
import { domainOf, extractEmails, fetchPage, guessCareersUrl } from "@/lib/integrations/web";
import type { ResearchSource } from "@/lib/db/schema";
import { aiConfigured } from "@/lib/env";

export type DiscoveredContact = {
  email: string;
  name: string | null;
  role: string | null;
  sourceUrl: string;
  sourceType: "CAREERS_PAGE" | "WEBSITE" | "JOB_BOARD" | "PRESS" | "DIRECTORY";
  confidence: number;
  verification: "UNVERIFIED" | "PATTERN_INFERRED" | "VERIFIED_PUBLIC";
  note: string;
};

export type ResearchResult = {
  description: string | null;
  industry: string | null;
  size: string | null;
  headquarters: string | null;
  technologies: string[];
  careersUrl: string | null;
  applicationProcess: string | null;
  hiringSignals: string[];
  contacts: DiscoveredContact[];
  sources: ResearchSource[];
  confidence: number;
  model: string;
  source: "ai" | "heuristic";
  notes: string;
};

export type ResearchInput = {
  companyName: string;
  website?: string | null;
  linkedinUrl?: string | null;
  careersUrl?: string | null;
  targetTitle?: string | null;
  industry?: string | null;
  deep?: boolean;
};

const ROLE_EMAIL_PATTERN = /\b(jobs?|careers?|recrut\w*|rh|hr|talent|hiring|contact|apply|team|people)\b/i;

/**
 * Company Research Agent.
 *
 * Multi-source: website → careers page → LinkedIn URL (public metadata only).
 * Contact discovery is strictly evidence-based — an email is only reported when it
 * literally appears in a fetched public page. When one public address is found, sibling
 * role addresses on the same domain may be inferred, but they are always labelled
 * `PATTERN_INFERRED` with a low confidence score and are never auto-selected for sending.
 */
export async function researchCompany(input: ResearchInput): Promise<ResearchResult> {
  const sources: ResearchSource[] = [];
  const contacts: DiscoveredContact[] = [];
  const technologies = new Set<string>();

  const urlsToFetch: { url: string; kind: ResearchSource["kind"] }[] = [];
  if (input.website) {
    urlsToFetch.push({ url: input.website, kind: "WEBSITE" });
    if (input.deep !== false) {
      for (const careersUrl of guessCareersUrl(input.website).slice(0, 3)) {
        urlsToFetch.push({ url: careersUrl, kind: "CAREERS" });
      }
    }
  }
  if (input.careersUrl) urlsToFetch.push({ url: input.careersUrl, kind: "CAREERS" });
  if (input.linkedinUrl) urlsToFetch.push({ url: input.linkedinUrl, kind: "LINKEDIN" });

  const pages = await Promise.all(urlsToFetch.slice(0, 6).map(async (target) => ({ target, page: await fetchPage(target.url) })));

  let reachable = 0;
  const excerpts: { url: string; kind: string; excerpt: string }[] = [];

  for (const { target, page } of pages) {
    if (!page.ok) continue;
    reachable += 1;
    sources.push({
      url: page.url,
      title: page.title,
      kind: target.kind,
      snippet: page.text.slice(0, 400),
      fetchedAt: new Date().toISOString(),
    });
    excerpts.push({ url: page.url, kind: target.kind, excerpt: page.text.slice(0, 6000) });
    page.technologies.forEach((tech) => technologies.add(tech));

    // ── Evidence-based contact extraction ─────────────────────────
    const domain = domainOf(page.url);
    const seen = new Set(contacts.map((c) => c.email));
    for (const email of page.emails) {
      const emailDomain = email.split("@")[1] ?? "";
      if (domain && !emailDomain.includes(domain) && !domain.includes(emailDomain)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      const isRoleAddress = ROLE_EMAIL_PATTERN.test(email.split("@")[0] ?? "");
      contacts.push({
        email,
        name: null,
        role: isRoleAddress ? guessRole(email) : null,
        sourceUrl: page.url,
        sourceType: target.kind === "CAREERS" ? "CAREERS_PAGE" : target.kind === "LINKEDIN" ? "DIRECTORY" : "WEBSITE",
        confidence: isRoleAddress ? 0.85 : 0.6,
        verification: "VERIFIED_PUBLIC",
        note: `Found in the public page text of ${page.url}`,
      });
    }
  }

  // Pattern inference — only from an already-observed public address on the same domain.
  if (contacts.length) {
    const verified = contacts.find((c) => c.verification === "VERIFIED_PUBLIC");
    if (verified) {
      const domain = verified.email.split("@")[1];
      const local = verified.email.split("@")[0];
      const candidates = local.includes(".") ? [] : ["careers", "jobs", "recruitment", "talent", "rh"];
      for (const candidate of candidates) {
        const email = `${candidate}@${domain}`;
        if (contacts.some((c) => c.email === email)) continue;
        contacts.push({
          email,
          name: null,
          role: guessRole(email),
          sourceUrl: verified.sourceUrl,
          sourceType: verified.sourceType,
          confidence: 0.3,
          verification: "PATTERN_INFERRED",
          note: `Inferred from the public pattern observed at ${verified.email} — not verified, do not use without checking`,
        });
      }
    }
  }

  let description: string | null = null;
  let industry = input.industry ?? null;
  let size: string | null = null;
  let headquarters: string | null = null;
  let applicationProcess: string | null = null;
  let careersUrl = input.careersUrl ?? null;
  let hiringSignals: string[] = [];
  let confidence = reachable ? Math.min(0.9, 0.35 + reachable * 0.18) : 0.12;
  let model = "fallback-heuristic";
  let source: "ai" | "heuristic" = "heuristic";
  let notes = reachable
    ? `Fetched ${reachable} public page(s).`
    : "No public page could be reached from this environment (network restricted or site blocks crawlers).";

  if (aiConfigured) {
    try {
      const result = await complete<{
        description?: string;
        industry?: string | null;
        size?: string | null;
        headquarters?: string | null;
        technologies?: string[];
        careersUrl?: string | null;
        applicationProcess?: string | null;
        hiringSignals?: string[];
        confidence?: number;
        notes?: string;
      }>({
        system: SYSTEM.research,
        user: PROMPT.research({
          company: {
            name: input.companyName,
            website: input.website,
            linkedinUrl: input.linkedinUrl,
            industry: input.industry,
            targetTitle: input.targetTitle,
          },
          sources: excerpts,
        }),
        temperature: 0.2,
        maxTokens: 1200,
      });

      description = result.data.description?.trim() || null;
      industry = result.data.industry ?? industry;
      size = result.data.size ?? null;
      headquarters = result.data.headquarters ?? null;
      applicationProcess = result.data.applicationProcess ?? null;
      careersUrl = result.data.careersUrl ?? careersUrl;
      hiringSignals = (result.data.hiringSignals ?? []).slice(0, 8);
      (result.data.technologies ?? []).forEach((tech) => technologies.add(tech));
      confidence = Math.max(0, Math.min(1, result.data.confidence ?? confidence));
      notes = result.data.notes?.trim() || notes;
      model = result.provider || result.model;
      source = "ai";
    } catch (error) {
      if (!isAIUnavailable(error)) {
        console.warn("[research] LLM summary failed, falling back to page evidence:", error);
        notes = `${notes} Model summary unavailable (${error instanceof Error ? error.message : "error"}).`;
      }
    }
  } else if (reachable) {
    description = summariseFromPages(pages.map((p) => p.page.text).filter(Boolean).join("\n\n"), input.companyName);
  }

  if (!careersUrl && input.website) {
    const careersPage = pages.find((p) => p.target.kind === "CAREERS" && p.page.ok);
    careersUrl = careersPage?.page.url ?? null;
  }

  if (!hiringSignals.length) {
    hiringSignals = deriveHiringSignals(pages.map((p) => p.page.text).join("\n"));
  }

  return {
    description,
    industry,
    size,
    headquarters,
    technologies: Array.from(technologies).slice(0, 20),
    careersUrl,
    applicationProcess,
    hiringSignals: hiringSignals.slice(0, 8),
    contacts: contacts.slice(0, 12),
    sources,
    confidence,
    model,
    source,
    notes,
  };
}

function guessRole(email: string): string | null {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (/^jobs?$/.test(local)) return "Job applications";
  if (/^careers?$/.test(local)) return "Careers";
  if (/recrut|^rh$|^hr$/.test(local)) return "Recruitment";
  if (/talent/.test(local)) return "Talent acquisition";
  if (/hiring/.test(local)) return "Hiring";
  if (/contact/.test(local)) return "General contact";
  return null;
}

function summariseFromPages(text: string, companyName: string): string | null {
  if (!text.trim()) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 60);
  const relevant = sentences.filter((s) => new RegExp(companyName.split(" ")[0], "i").test(s) || /we (are|build|help|design|develop)|company|platform/i.test(s));
  const chosen = (relevant.length ? relevant : sentences).slice(0, 3).join(" ");
  return chosen ? chosen.slice(0, 600) : cleaned.slice(0, 600);
}

function deriveHiringSignals(text: string): string[] {
  const signals: string[] = [];
  if (/we are hiring|we're hiring|join (us|our team)/i.test(text)) signals.push("Careers page actively invites applications");
  if (/remote|hybrid|télétravail/i.test(text)) signals.push("Remote or hybrid work mentioned");
  if (/greenhouse|lever|workday|smartrecruiters|teamtailor|welcome to the jungle/i.test(text)) signals.push("Uses an applicant tracking system with public job feeds");
  if (/apply|postuler/i.test(text)) signals.push("Public application flow detected");
  return signals;
}

/** Convenience helper used by the API layer to extract contacts from a single URL. */
export async function extractContactsFromUrl(url: string) {
  const page = await fetchPage(url);
  return {
    ok: page.ok,
    url: page.url,
    emails: page.emails,
    error: page.error,
  };
}

export { extractEmails };
