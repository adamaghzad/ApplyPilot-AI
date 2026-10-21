import { and, desc, eq, gte, sql } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { companies, jobListings, jobMatches } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const url = new URL(req.url);
    const source = url.searchParams.get("source");
    const remote = url.searchParams.get("remote");
    const search = url.searchParams.get("search")?.trim().toLowerCase();
    const minScore = url.searchParams.get("minScore");
    const onlyNew = url.searchParams.get("onlyNew") === "1";
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));

    const rows = await getDb()
      .select({
        job: jobListings,
        company: companies,
        score: jobMatches.score,
        explanation: jobMatches.explanation,
        matchedSkills: jobMatches.matchedSkills,
        missingSkills: jobMatches.missingSkills,
        matchStatus: jobMatches.status,
      })
      .from(jobListings)
      .innerJoin(companies, eq(companies.id, jobListings.companyId))
      .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobListings.id), eq(jobMatches.userId, user.id)))
      .where(
        and(
          eq(jobListings.userId, user.id),
          source ? eq(jobListings.source, source as never) : undefined,
          remote ? eq(jobListings.remote, remote as never) : undefined,
          minScore ? gte(jobMatches.score, Number(minScore)) : undefined,
          onlyNew ? gte(jobListings.discoveredAt, new Date(Date.now() - 48 * 3600_000)) : undefined,
        ),
      )
      .orderBy(desc(sql`coalesce(${jobMatches.score}, 0)`), desc(jobListings.discoveredAt))
      .limit(limit);

    const filtered = rows.filter((row) => {
      if (!search) return true;
      return (
        row.job.title.toLowerCase().includes(search) ||
        row.company.name.toLowerCase().includes(search) ||
        (row.job.location ?? "").toLowerCase().includes(search)
      );
    });

    return ok({ jobs: filtered });
  } catch (error) {
    return fail(error);
  }
}
