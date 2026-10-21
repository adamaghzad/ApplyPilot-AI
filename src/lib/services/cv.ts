import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { candidateProfiles, cvDocuments } from "@/lib/db/schema";
import { analyseCvWithAI, extractCvText, parseCvText, type ParsedCV } from "@/lib/cv/parse";
import { recordActivity, recordAudit, startAgentRun, updateAgentRun } from "@/lib/audit";
import { PROMPT_VERSION } from "@/lib/ai/client";
import { eventBus } from "@/lib/events";
import { putFile, readFile, deleteFile } from "@/lib/storage";
import { ApiError } from "@/lib/api";

export const MAX_CV_BYTES = 10 * 1024 * 1024;

const ACCEPTED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

export function validateCvFile(file: { name: string; type: string; size: number }) {
  const extensionOk = /\.(pdf|docx|txt|md)$/i.test(file.name);
  if (file.size > MAX_CV_BYTES) throw new ApiError("CV must be 10 MB or smaller", 413);
  if (!ACCEPTED_MIME.includes(file.type) && !extensionOk) {
    throw new ApiError("Unsupported format — upload a PDF, DOCX or TXT file", 415);
  }
}

/**
 * CV Analysis Agent (service layer): stores the document, extracts text, builds a
 * structured profile and merges it into the candidate profile.
 *
 * Only fills fields that are empty (identity) or that legitimately come from the CV
 * (experience, education, skills). User preferences are never overwritten.
 */
export async function ingestCv(
  userId: string,
  file: { name: string; type: string; size: number; buffer: Buffer },
): Promise<{ document: typeof cvDocuments.$inferSelect; parsed: ParsedCV }> {
  validateCvFile(file);

  const stored = await putFile({ userId, folder: "cv", fileName: file.name, buffer: file.buffer });

  const [document] = await getDb()
    .insert(cvDocuments)
    .values({
      userId,
      fileName: stored.fileName,
      storagePath: stored.storagePath,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: stored.sizeBytes,
      status: "PARSING",
    })
    .returning();

  const run = await startAgentRun({
    userId,
    agent: "CV_ANALYSIS",
    input: { documentId: document.id, fileName: stored.fileName },
    message: `Analysing ${stored.fileName}`,
  });
  await recordActivity({ userId, agent: "CV_ANALYSIS", message: `Parsing ${stored.fileName}`, meta: { documentId: document.id } });

  try {
    const text = await extractCvText({ buffer: file.buffer, mimeType: file.type, fileName: file.name });
    if (text.trim().length < 40) {
      throw new Error("We could not extract enough text from this file. Try a text-based PDF (not a scan) or a DOCX.");
    }

    const [profile] = await getDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
    const language = profile?.preferredLanguage ?? (/\b(bonjour|expérience|compétences|formation)\b/i.test(text) ? "fr" : "en");

    const ruleBased = parseCvText(text);
    await updateAgentRun(run.id, userId, { progress: 60, message: "Structuring profile" });
    const parsed = (await analyseCvWithAI(text, language)) ?? ruleBased;

    await getDb()
      .update(cvDocuments)
      .set({
        rawText: text.slice(0, 200_000),
        parsed: parsed as unknown as Record<string, unknown>,
        status: "READY",
        language,
        updatedAt: new Date(),
      })
      .where(eq(cvDocuments.id, document.id));

    await mergeIntoProfile(userId, parsed, text);

    await updateAgentRun(run.id, userId, {
      progress: 100,
      status: "COMPLETED",
      message: "CV analysed",
      promptVersion: PROMPT_VERSION,
      output: { skills: parsed.skills.length, experience: parsed.experience.length, years: parsed.yearsExperience },
    });

    await recordActivity({
      userId,
      agent: "CV_ANALYSIS",
      message: `CV analysed — ${parsed.skills.length} skills, ${parsed.experience.length} role(s), ${parsed.yearsExperience} years detected`,
      type: "SUCCESS",
      meta: { documentId: document.id },
    });
    await recordAudit({ userId, action: "cv.ingest", entity: "cvDocument", entityId: document.id, meta: { fileName: stored.fileName } });

    const [updated] = await getDb().select().from(cvDocuments).where(eq(cvDocuments.id, document.id)).limit(1);
    eventBus.publish(userId, { type: "activity", payload: { message: "CV ready" } });
    return { document: updated ?? document, parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parsing failed";
    await getDb().update(cvDocuments).set({ status: "FAILED", parseError: message, updatedAt: new Date() }).where(eq(cvDocuments.id, document.id));
    await updateAgentRun(run.id, userId, { status: "FAILED", error: message, message });
    await recordActivity({ userId, agent: "CV_ANALYSIS", message: `CV parsing failed: ${message}`, type: "ERROR" });
    throw error;
  }
}

async function mergeIntoProfile(userId: string, parsed: ParsedCV, rawText: string) {
  const existing = await getDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
  const profile = existing[0];

  const values = {
    fullName: profile?.fullName ?? parsed.fullName,
    headline: profile?.headline ?? parsed.headline,
    email: profile?.email ?? parsed.email,
    phone: profile?.phone ?? parsed.phone,
    city: profile?.city ?? parsed.city,
    country: profile?.country ?? parsed.country,
    linkedinUrl: profile?.linkedinUrl ?? parsed.linkedinUrl,
    githubUrl: profile?.githubUrl ?? parsed.githubUrl,
    portfolioUrl: profile?.portfolioUrl ?? parsed.portfolioUrl,
    yearsExperience: parsed.yearsExperience || profile?.yearsExperience || 0,
    currentTitle: profile?.currentTitle ?? parsed.experience[0]?.title ?? null,
    seniority: profile?.seniority ?? parsed.seniority,
    summary: profile?.summary ?? (parsed.summary || null),
    skills: parsed.skills.length ? parsed.skills : (profile?.skills ?? []),
    experience: parsed.experience.length ? parsed.experience : (profile?.experience ?? []),
    education: parsed.education.length ? parsed.education : (profile?.education ?? []),
    certifications: parsed.certifications.length ? parsed.certifications : (profile?.certifications ?? []),
    languages: parsed.languages.length ? parsed.languages : (profile?.languages ?? []),
    projects: parsed.projects.length ? parsed.projects : (profile?.projects ?? []),
    achievements: parsed.achievements.length ? parsed.achievements : (profile?.achievements ?? []),
    desiredTitles: profile?.desiredTitles?.length ? profile.desiredTitles : parsed.suggestedTitles,
    updatedAt: new Date(),
  };

  const completeness = computeCompleteness({ ...(profile ?? {}), ...values });

  if (profile) {
    await getDb().update(candidateProfiles).set({ ...values, completeness }).where(eq(candidateProfiles.userId, userId));
  } else {
    await getDb().insert(candidateProfiles).values({ userId, ...values, completeness });
  }

  if (rawText.length > 0 && !profile?.summary && parsed.summary) {
    // summary already applied above; kept explicit for clarity
  }
}

export function computeCompleteness(profile: Partial<typeof candidateProfiles.$inferSelect>): number {
  const checks: [boolean, number][] = [
    [Boolean(profile.fullName), 8],
    [Boolean(profile.headline), 8],
    [Boolean(profile.email || profile.phone), 6],
    [Boolean(profile.city || profile.country), 6],
    [Boolean(profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl), 6],
    [(profile.yearsExperience ?? 0) > 0, 6],
    [(profile.skills ?? []).length >= 5, 14],
    [(profile.experience ?? []).length >= 1, 16],
    [(profile.education ?? []).length >= 1, 10],
    [(profile.languages ?? []).length >= 1, 6],
    [(profile.desiredTitles ?? []).length >= 1, 8],
    [(profile.desiredLocations ?? []).length >= 1 || (profile.workModes ?? []).length >= 1, 6],
  ];
  const score = checks.reduce((total, [passed, weight]) => total + (passed ? weight : 0), 0);
  return Math.round(score);
}

export async function listCvDocuments(userId: string) {
  return getDb().select().from(cvDocuments).where(eq(cvDocuments.userId, userId)).orderBy(cvDocuments.createdAt);
}

export async function setPrimaryCv(userId: string, documentId: string) {
  await getDb().update(cvDocuments).set({ isPrimary: false }).where(eq(cvDocuments.userId, userId));
  const [row] = await getDb()
    .update(cvDocuments)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(and(eq(cvDocuments.id, documentId), eq(cvDocuments.userId, userId)))
    .returning();
  if (!row) throw new ApiError("CV document not found", 404);
  return row;
}

export async function deleteCv(userId: string, documentId: string) {
  const [row] = await getDb()
    .select()
    .from(cvDocuments)
    .where(and(eq(cvDocuments.id, documentId), eq(cvDocuments.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError("CV document not found", 404);
  await deleteFile(row.storagePath);
  await getDb().delete(cvDocuments).where(eq(cvDocuments.id, documentId));
  await recordAudit({ userId, action: "cv.delete", entity: "cvDocument", entityId: documentId });
  return { ok: true };
}

export async function getCvFile(userId: string, documentId: string) {
  const [row] = await getDb()
    .select()
    .from(cvDocuments)
    .where(and(eq(cvDocuments.id, documentId), eq(cvDocuments.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError("CV document not found", 404);
  const buffer = await readFile(row.storagePath);
  return { document: row, buffer };
}
