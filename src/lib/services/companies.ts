import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { companies, recruiterContacts } from "@/lib/db/schema";
import { researchCompany } from "@/lib/ai/agents/research";
import { recordActivity, recordAudit, startAgentRun, updateAgentRun } from "@/lib/audit";
import { PROMPT_VERSION } from "@/lib/ai/client";
import { eventBus } from "@/lib/events";
import { slugify } from "@/lib/utils";

export async function listCompanies(userId: string) {
  return getDb().select().from(companies).where(eq(companies.userId, userId)).orderBy(companies.createdAt);
}

export async function getCompany(userId: string, companyId: string) {
  const [company] = await getDb()
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .limit(1);
  return company ?? null;
}

export async function createCompany(
  userId: string,
  input: { name: string; website?: string | null; linkedinUrl?: string | null; industry?: string | null; targetTitle?: string | null; notes?: string | null },
) {
  const [company] = await getDb()
    .insert(companies)
    .values({
      userId,
      name: input.name,
      website: input.website?.trim() || null,
      linkedinUrl: input.linkedinUrl?.trim() || null,
      industry: input.industry ?? null,
      targetTitle: input.targetTitle ?? null,
      researchNotes: input.notes ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (company) {
    await recordActivity({ userId, agent: "RESEARCH", message: `Company added: ${company.name}`, type: "INFO", meta: { companyId: company.id } });
    eventBus.publish(userId, { type: "company", payload: { action: "created", company } });
  }
  return company ?? null;
}

export async function upsertManyCompanies(
  userId: string,
  input: { name: string; website?: string | null; targetTitle?: string | null }[],
) {
  const created = [];
  for (const item of input) {
    const company = await createCompany(userId, item);
    if (company) created.push(company);
  }
  return created;
}

/**
 * Runs the Research Agent for a company and persists everything it learns:
 * profile fields, technology signals, application process and — critically —
 * evidence-based recruitment contacts (never guessed addresses).
 */
export async function runCompanyResearch(userId: string, companyId: string, options: { deep?: boolean } = {}) {
  const company = await getCompany(userId, companyId);
  if (!company) throw new Error("Company not found");

  const run = await startAgentRun({ userId, agent: "RESEARCH", input: { companyId, name: company.name }, message: `Researching ${company.name}` });

  await getDb().update(companies).set({ researchStatus: "RESEARCHING", updatedAt: new Date() }).where(eq(companies.id, companyId));
  await recordActivity({ userId, agent: "RESEARCH", message: `Research started for ${company.name}`, meta: { companyId } });

  try {
    await updateAgentRun(run.id, userId, { progress: 20, message: "Fetching public sources" });
    const result = await researchCompany({
      companyName: company.name,
      website: company.website,
      linkedinUrl: company.linkedinUrl,
      careersUrl: company.careersUrl,
      targetTitle: company.targetTitle,
      industry: company.industry,
      deep: options.deep ?? true,
    });

    await updateAgentRun(run.id, userId, { progress: 70, message: "Storing findings" });

    await getDb()
      .update(companies)
      .set({
        description: result.description ?? company.description,
        industry: result.industry ?? company.industry,
        size: result.size ?? company.size,
        headquarters: result.headquarters ?? company.headquarters,
        technologies: result.technologies.length ? result.technologies : company.technologies,
        careersUrl: result.careersUrl ?? company.careersUrl,
        researchStatus: "READY",
        researchConfidence: result.confidence,
        researchData: {
          sources: result.sources,
          applicationProcess: result.applicationProcess ?? undefined,
          techStack: result.technologies,
          hiringSignals: result.hiringSignals,
        },
        researchNotes: result.notes,
        lastResearchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Persist contacts (evidence-based only).
    let contactsCreated = 0;
    for (const contact of result.contacts) {
      const [row] = await getDb()
        .insert(recruiterContacts)
        .values({
          companyId,
          email: contact.email,
          name: contact.name,
          role: contact.role,
          sourceUrl: contact.sourceUrl,
          sourceType: contact.sourceType,
          confidence: contact.confidence,
          verification: contact.verification,
          notes: contact.note,
        })
        .onConflictDoNothing()
        .returning();
      if (row) contactsCreated += 1;
    }

    await recordActivity({
      userId,
      agent: "RESEARCH",
      message: contactsCreated
        ? `${company.name} researched — ${contactsCreated} recruitment contact(s) found`
        : `${company.name} researched — no public recruitment email found (nothing invented)`,
      type: contactsCreated ? "SUCCESS" : "WARNING",
      meta: { companyId, sources: result.sources.length, confidence: result.confidence },
    });

    await updateAgentRun(run.id, userId, {
      progress: 100,
      status: "COMPLETED",
      message: "Research complete",
      model: result.model,
      promptVersion: PROMPT_VERSION,
      output: { sources: result.sources.length, contacts: result.contacts.length, confidence: result.confidence, notes: result.notes },
    });

    await recordAudit({ userId, action: "company.research", entity: "company", entityId: companyId, meta: { sources: result.sources.length } });

    const updated = await getCompany(userId, companyId);
    eventBus.publish(userId, { type: "company", payload: { action: "researched", company: updated } });

    return { company: updated, result, contactsCreated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed";
    await getDb().update(companies).set({ researchStatus: "FAILED", researchNotes: message, updatedAt: new Date() }).where(eq(companies.id, companyId));
    await updateAgentRun(run.id, userId, { status: "FAILED", error: message, message });
    await recordActivity({ userId, agent: "RESEARCH", message: `Research failed for ${company.name}: ${message}`, type: "ERROR", meta: { companyId } });
    throw error;
  }
}

export async function listContacts(userId: string, companyId: string) {
  const company = await getCompany(userId, companyId);
  if (!company) return [];
  return getDb()
    .select()
    .from(recruiterContacts)
    .where(eq(recruiterContacts.companyId, companyId))
    .orderBy(recruiterContacts.confidence);
}

export function companySlug(name: string) {
  return slugify(name);
}
