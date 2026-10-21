import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { candidateProfiles, companies, jobListings, jobMatches, type JobListing } from "@/lib/db/schema";
import { careersPage, greenhouse, indeed, lever, linkedIn, welcomeToTheJungle, type AdapterResult, type RawListing } from "@/lib/integrations/jobboards";
import { matchJob } from "@/lib/ai/agents/matching";
import { recordActivity, startAgentRun, updateAgentRun } from "@/lib/audit";
import { PROMPT_VERSION } from "@/lib/ai/client";
import { eventBus } from "@/lib/events";
import { enqueue } from "@/lib/jobs/queue";
import { getRules, isRuleActive, numberRule } from "@/lib/services/rules";
import { jobFingerprint, slugify, unique } from "@/lib/utils";

export type DiscoveryCriteria = {
  keywords: string[];
  locations: string[];
  remote?: "REMOTE" | "HYBRID" | "ONSITE" | null;
  skills: string[];
  seniority?: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "MANAGER" | null;
  maxAgeDays: number;
  sources: ("LINKEDIN" | "INDEED" | "GREENHOUSE" | "LEVER" | "WTTJ" | "CAREERS_PAGE")[];
  limit: number;
};

export type SourceReport = {
  source: string;
  status: AdapterResult["status"];
  count: number;
  reason?: string;
};

export type DiscoveryReport = {
  discovered: number;
  duplicates: number;
  filteredOut: number;
  matched: number;
  autoPrepared: number;
  sourceReports: SourceReport[];
  listings: JobListing[];
};

function matchesKeywords(title: string, keywords: string[]) {
  const haystack = ` ${title.toLowerCase().replace(/[^a-z0-9+ ]/g, " ")} `;
  return keywords.some((keyword) => {
    const tokens = keyword.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").split(/\s+/).filter(Boolean);
    return tokens.every((token) => haystack.includes(` ${token}`) || haystack.includes(`${token} `));
  });
}

function matchesLocation(listing: RawListing, locations: string[]) {
  if (!locations.length) return true;
  const haystack = `${listing.location ?? ""}`.toLowerCase();
  return locations.some((location) => haystack.includes(location.toLowerCase()) || location.toLowerCase().includes(haystack));
}

function withinAge(listing: RawListing, maxAgeDays: number) {
  if (!listing.postedAt) return true;
  const ageDays = (Date.now() - new Date(listing.postedAt).getTime()) / 86_400_000;
  return ageDays <= maxAgeDays;
}

/**
 * Job Discovery Agent (service layer).
 *
 * Fans out to the permitted sources, filters against the user's criteria and
 * automation rules, de-duplicates against everything already in the database,
 * persists new listings, scores them with the Matching Agent, and (optionally)
 * queues preparation for the best ones.
 */
export async function runJobDiscovery(userId: string, criteria: DiscoveryCriteria): Promise<DiscoveryReport> {
  const run = await startAgentRun({
    userId,
    agent: "DISCOVERY",
    input: { keywords: criteria.keywords, locations: criteria.locations, sources: criteria.sources },
    message: `Searching ${criteria.sources.length} source(s) for ${criteria.keywords.join(", ")}`,
  });

  await recordActivity({
    userId,
    agent: "DISCOVERY",
    message: `Discovery started — ${criteria.keywords.join(", ")}${criteria.locations.length ? ` in ${criteria.locations.join(", ")}` : ""}`,
    meta: { sources: criteria.sources },
  });

  const userCompanies = await getDb().select().from(companies).where(eq(companies.userId, userId));
  const rules = await getRules(userId);
  const maxAge = isRuleActive(rules, "max_listing_age_days")
    ? Math.min(criteria.maxAgeDays, numberRule(rules, "max_listing_age_days", "value", criteria.maxAgeDays))
    : criteria.maxAgeDays;

  const sourceReports: SourceReport[] = [];
  const raw: RawListing[] = [];

  const push = (source: string, result: AdapterResult) => {
    sourceReports.push({ source, status: result.status, count: result.listings.length, reason: result.reason });
    raw.push(...result.listings);
  };

  // ── Global (query based) sources ────────────────────────────────
  const query = { keywords: criteria.keywords, locations: criteria.locations };
  const globalTasks: Promise<void>[] = [];
  if (criteria.sources.includes("LINKEDIN")) {
    globalTasks.push(linkedIn(query).then((r) => push("LINKEDIN", r)));
  }
  if (criteria.sources.includes("INDEED")) {
    globalTasks.push(indeed(query).then((r) => push("INDEED", r)));
  }
  if (criteria.sources.includes("WTTJ")) {
    globalTasks.push(
      welcomeToTheJungle(criteria.keywords.join(" "), criteria.locations[0]).then((r) => push("WTTJ", r)),
    );
  }

  // ── Per-company sources ─────────────────────────────────────────
  const companyTasks: Promise<void>[] = [];
  for (const company of userCompanies) {
    const slug = slugify(company.name);
    if (criteria.sources.includes("GREENHOUSE")) {
      companyTasks.push(greenhouse(slug).then((r) => push(`GREENHOUSE:${company.name}`, r)));
    }
    if (criteria.sources.includes("LEVER")) {
      companyTasks.push(lever(slug).then((r) => push(`LEVER:${company.name}`, r)));
    }
    if (criteria.sources.includes("CAREERS_PAGE") && company.careersUrl) {
      companyTasks.push(
        careersPage(company.name, company.careersUrl, criteria.keywords).then((r) => push(`CAREERS_PAGE:${company.name}`, r)),
      );
    }
  }

  await Promise.all([...globalTasks, ...companyTasks]);

  for (const report of sourceReports) {
    if (report.status === "ok") {
      await recordActivity({
        userId,
        agent: "DISCOVERY",
        message: `${report.source} → ${report.count} listing(s)`,
        type: report.count ? "SUCCESS" : "INFO",
        meta: report,
      });
    } else {
      await recordActivity({
        userId,
        agent: "DISCOVERY",
        message: `${report.source} → unavailable: ${report.reason ?? "unknown reason"}`,
        type: "WARNING",
        meta: report,
      });
    }
  }

  // ── Filter ──────────────────────────────────────────────────────
  const filtered = raw.filter((listing) => {
    if (!matchesKeywords(listing.title, criteria.keywords)) return false;
    if (!matchesLocation(listing, criteria.locations)) return false;
    if (criteria.remote && listing.remote !== criteria.remote) return false;
    if (criteria.seniority && criteria.seniority !== "MID" && !listing.title.toLowerCase().includes(criteria.seniority.toLowerCase())) {
      // Soft filter: skip only when the title explicitly signals a different level.
      if (/\b(senior|lead|principal|junior|intern|manager)\b/i.test(listing.title)) return false;
    }
    if (!withinAge(listing, maxAge)) return false;
    if (criteria.skills.length) {
      const haystack = `${listing.title} ${listing.description}`.toLowerCase();
      if (!criteria.skills.some((skill) => haystack.includes(skill.toLowerCase()))) return false;
    }
    return true;
  });

  const filteredOut = raw.length - filtered.length;

  // ── De-duplicate (in-batch + against the database) ──────────────
  const seen = new Set<string>();
  const candidates: RawListing[] = [];
  let duplicates = 0;
  for (const listing of filtered) {
    const hash = jobFingerprint({ company: listing.company, title: listing.title, location: listing.location, source: listing.source });
    if (seen.has(hash)) {
      duplicates += 1;
      continue;
    }
    seen.add(hash);
    candidates.push(listing);
  }

  const existing = await getDb()
    .select({ hash: jobListings.dedupeHash })
    .from(jobListings)
    .where(and(eq(jobListings.userId, userId), inArray(jobListings.dedupeHash, Array.from(seen))));
  const existingHashes = new Set(existing.map((row) => row.hash));

  const finalCandidates = candidates
    .filter((listing) => {
      const hash = jobFingerprint({ company: listing.company, title: listing.title, location: listing.location, source: listing.source });
      if (existingHashes.has(hash)) {
        duplicates += 1;
        return false;
      }
      return true;
    })
    .slice(0, criteria.limit);

  // ── Resolve or create companies ─────────────────────────────────
  const companyByName = new Map(userCompanies.map((company) => [slugify(company.name), company]));
  const inserted: JobListing[] = [];

  for (const listing of finalCandidates) {
    const slug = slugify(listing.company);
    let company = companyByName.get(slug);
    if (!company) {
      const [created] = await getDb()
        .insert(companies)
        .values({ userId, name: listing.company, researchStatus: "PENDING" })
        .onConflictDoNothing()
        .returning();
      company = created;
      if (company) companyByName.set(slug, company);
    }
    if (!company) continue;

    const hash = jobFingerprint({ company: listing.company, title: listing.title, location: listing.location, source: listing.source });
    const [row] = await getDb()
      .insert(jobListings)
      .values({
        userId,
        companyId: company.id,
        title: listing.title,
        location: listing.location,
        remote: listing.remote,
        employmentType: listing.employmentType,
        department: listing.department,
        description: listing.description.slice(0, 15_000),
        skills: listing.skills,
        salaryMin: listing.salaryMin,
        salaryMax: listing.salaryMax,
        source: listing.source,
        sourceUrl: listing.url,
        applyUrl: listing.applyUrl,
        externalId: listing.externalId,
        postedAt: listing.postedAt,
        dedupeHash: hash,
      })
      .onConflictDoNothing()
      .returning();

    if (row) {
      inserted.push(row);
      eventBus.publish(userId, { type: "job", payload: { action: "discovered", job: row } });
    }
  }

  // ── Score with the Matching Agent ───────────────────────────────
  const [profile] = await getDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
  let matched = 0;
  let autoPrepared = 0;

  if (profile && inserted.length) {
    const minScore = numberRule(rules, "min_match_score", "value", 85);
    const autoPrepare = isRuleActive(rules, "auto_prepare");
    let bestScore = 0;

    for (const job of inserted) {
      const match = await matchJob({ profile, job, language: profile.preferredLanguage });
      await getDb()
        .insert(jobMatches)
        .values({
          jobId: job.id,
          userId,
          score: match.score,
          breakdown: match.breakdown,
          explanation: match.explanation,
          matchedSkills: match.matchedSkills,
          missingSkills: match.missingSkills,
        })
        .onConflictDoUpdate({
          target: [jobMatches.jobId, jobMatches.userId],
          set: { score: match.score, breakdown: match.breakdown, explanation: match.explanation, updatedAt: new Date() },
        });
      matched += 1;
      bestScore = Math.max(bestScore, match.score);

      if (autoPrepare && match.score >= minScore) {
        await enqueue({
          userId,
          type: "PREPARE_APPLICATION",
          payload: { jobId: job.id, companyId: job.companyId },
          idempotencyKey: `prepare:${userId}:${job.id}`,
          priority: 3,
        });
        autoPrepared += 1;
      }
    }

    await recordActivity({
      userId,
      agent: "MATCHING",
      message: `${matched} new listing(s) scored — best compatibility ${bestScore}%`,
      type: "SUCCESS",
      meta: { matched, bestScore },
    });
  }

  await updateAgentRun(run.id, userId, {
    progress: 100,
    status: "COMPLETED",
    message: `${inserted.length} new listing(s)`,
    promptVersion: PROMPT_VERSION,
    output: { discovered: inserted.length, duplicates, filteredOut, sourceReports },
  });

  await recordActivity({
    userId,
    agent: "DISCOVERY",
    message:
      inserted.length > 0
        ? `Discovery complete — ${inserted.length} new opportunit${inserted.length === 1 ? "y" : "ies"}, ${duplicates} duplicate(s) skipped`
        : `Discovery complete — no new listings (${sourceReports.filter((r) => r.status !== "ok").length} source(s) unavailable)`,
    type: inserted.length ? "SUCCESS" : "WARNING",
    meta: { discovered: inserted.length, duplicates, filteredOut },
  });

  return {
    discovered: inserted.length,
    duplicates,
    filteredOut,
    matched,
    autoPrepared,
    sourceReports,
    listings: inserted,
  };
}

/** Recomputes the compatibility score for a single job (used after profile edits). */
export async function rescoreJob(userId: string, jobId: string) {
  const [profile] = await getDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
  const [job] = await getDb().select().from(jobListings).where(and(eq(jobListings.id, jobId), eq(jobListings.userId, userId))).limit(1);
  if (!profile || !job) return null;

  const match = await matchJob({ profile, job, language: profile.preferredLanguage });
  const [row] = await getDb()
    .insert(jobMatches)
    .values({
      jobId,
      userId,
      score: match.score,
      breakdown: match.breakdown,
      explanation: match.explanation,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
    })
    .onConflictDoUpdate({
      target: [jobMatches.jobId, jobMatches.userId],
      set: { score: match.score, breakdown: match.breakdown, explanation: match.explanation, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export function uniqueSources(sources: string[]) {
  return unique(sources);
}
