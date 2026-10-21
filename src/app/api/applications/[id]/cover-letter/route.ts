import { and, desc, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { applications, candidateProfiles, companies, coverLetters, jobListings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { draftCoverLetter } from "@/lib/ai/agents/coverLetter";
import { coverLetterGenerateSchema, coverLetterUpdateSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/audit";
import { PROMPT_VERSION } from "@/lib/ai/client";
import { htmlToText } from "@/lib/ai/quality";
import { ApiError, fail, ok } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = coverLetterGenerateSchema.parse(await req.json().catch(() => ({})));
    const db = getDb();

    const [row] = await db
      .select({ application: applications, job: jobListings, company: companies })
      .from(applications)
      .innerJoin(jobListings, eq(jobListings.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, applications.companyId))
      .where(and(eq(applications.id, id), eq(applications.userId, user.id)))
      .limit(1);
    if (!row) throw new ApiError("Application not found", 404);

    const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
    if (!profile) throw new ApiError("Candidate profile missing", 400);

    const letter = await draftCoverLetter({
      profile,
      job: row.job,
      company: row.company,
      language: input.language || profile.preferredLanguage || "en",
      style: input.style,
    });

    const [coverLetter] = await db
      .insert(coverLetters)
      .values({
        applicationId: id,
        jobId: row.job.id,
        userId: user.id,
        title: letter.title,
        content: letter.content,
        plainText: letter.plainText,
        language: input.language || profile.preferredLanguage || "en",
        style: input.style,
        model: letter.model,
        promptVersion: PROMPT_VERSION,
        generationMs: letter.latencyMs,
      })
      .returning();

    await recordActivity({
      userId: user.id,
      agent: "COVER_LETTER",
      message: `Cover letter regenerated (${letter.model}) — ${letter.wordCount} words`,
      type: "SUCCESS",
      meta: { applicationId: id },
    });

    return ok({ coverLetter, draft: letter }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const patch = coverLetterUpdateSchema.parse(await req.json());
    const db = getDb();

    const [current] = await db
      .select()
      .from(coverLetters)
      .where(and(eq(coverLetters.applicationId, id), eq(coverLetters.userId, user.id)))
      .orderBy(desc(coverLetters.createdAt))
      .limit(1);
    if (!current) throw new ApiError("No cover letter found", 404);

    const [coverLetter] = await db
      .update(coverLetters)
      .set({
        ...(patch.title ? { title: patch.title } : {}),
        content: patch.content,
        plainText: patch.plainText ?? htmlToText(patch.content),
        updatedAt: new Date(),
      })
      .where(eq(coverLetters.id, current.id))
      .returning();

    return ok({ coverLetter });
  } catch (error) {
    return fail(error);
  }
}
