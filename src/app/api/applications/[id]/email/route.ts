import { and, desc, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { applications, candidateProfiles, companies, generatedEmails, jobListings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { draftEmail } from "@/lib/ai/agents/email";
import { emailUpdateSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/audit";
import { PROMPT_VERSION } from "@/lib/ai/client";
import { fail, ok } from "@/lib/api";
import { ApiError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Regenerates the recruitment email for an application. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { tone?: "FORMAL" | "PROFESSIONAL" | "FRIENDLY" | "CONCISE"; language?: "en" | "fr"; extraContext?: string };
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

    const draft = await draftEmail({
      profile,
      job: row.job,
      company: row.company,
      recipientEmail: row.application.recipientEmail,
      tone: body.tone ?? "PROFESSIONAL",
      language: body.language ?? profile.preferredLanguage ?? "en",
      extraContext: body.extraContext ?? null,
    });

    const [email] = await db
      .insert(generatedEmails)
      .values({
        applicationId: id,
        userId: user.id,
        subject: draft.subject,
        body: draft.body,
        tone: body.tone ?? "PROFESSIONAL",
        language: body.language ?? profile.preferredLanguage ?? "en",
        recipientEmail: row.application.recipientEmail,
        personalizationScore: draft.personalizationScore,
        qualityScore: draft.qualityScore,
        model: draft.model,
        promptVersion: PROMPT_VERSION,
        generationMs: draft.latencyMs,
      })
      .returning();

    await db.update(applications).set({ subject: draft.subject, updatedAt: new Date() }).where(eq(applications.id, id));

    await recordActivity({
      userId: user.id,
      agent: "EMAIL",
      message: `Email regenerated (${draft.model}) — ${draft.personalizationScore}% personalization`,
      type: "SUCCESS",
      meta: { applicationId: id },
    });

    return ok({ email, draft }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** Edits the current draft (the version that would be sent). */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const patch = emailUpdateSchema.parse(await req.json());
    const db = getDb();

    const [current] = await db
      .select()
      .from(generatedEmails)
      .where(and(eq(generatedEmails.applicationId, id), eq(generatedEmails.userId, user.id)))
      .orderBy(desc(generatedEmails.createdAt))
      .limit(1);
    if (!current) throw new ApiError("No email draft found", 404);

    const [email] = await db
      .update(generatedEmails)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(generatedEmails.id, current.id))
      .returning();
    await db.update(applications).set({ subject: patch.subject, updatedAt: new Date() }).where(eq(applications.id, id));

    return ok({ email });
  } catch (error) {
    return fail(error);
  }
}
