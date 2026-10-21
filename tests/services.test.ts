import { beforeAll, describe, expect, it } from "vitest";

import { createCompany, createContact, createJob, createTestUser, testDb } from "./helpers/db";

/**
 * Database-backed integration tests. They run against PGlite in memory with the
 * real migrations applied, exercising the same service code the API routes call.
 */
describe("automation rules", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser()).id;
  });

  it("seeds a complete default rule set for every user", async () => {
    const { getRules } = await import("@/lib/services/rules");
    const rules = await getRules(userId);

    expect(Object.keys(rules).length).toBeGreaterThanOrEqual(8);
    expect(rules.min_match_score.enabled).toBe(true);
    expect(rules.require_approval.enabled).toBe(true);
    expect(rules.daily_send_limit.config.value).toBe(10);
  });

  it("persists an update and reads it back", async () => {
    const { getRules, upsertRule } = await import("@/lib/services/rules");

    await upsertRule(userId, {
      key: "min_match_score",
      label: "Minimum compatibility score",
      description: "Only prepare applications at or above this score.",
      enabled: true,
      config: { value: 42 },
    });

    const rules = await getRules(userId);
    expect(rules.min_match_score.config.value).toBe(42);
  });

  it("is idempotent — updating twice does not create duplicate rules", async () => {
    const { getRules, upsertRule } = await import("@/lib/services/rules");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await upsertRule(userId, {
        key: "daily_send_limit",
        label: "Daily send limit",
        description: "Maximum applications sent per day.",
        enabled: true,
        config: { value: 5 + attempt },
      });
    }

    const rules = await getRules(userId);
    expect(rules.daily_send_limit.config.value).toBe(7);
    expect(Object.keys(rules).length).toBeGreaterThanOrEqual(8);
  });

  it("restores defaults on reset", async () => {
    const { getRules, resetRules } = await import("@/lib/services/rules");
    await resetRules(userId);
    const rules = await getRules(userId);
    expect(rules.min_match_score.config.value).toBe(85);
  });
});

describe("application preparation", () => {
  let userId: string;
  let jobId: string;
  let companyId: string;

  beforeAll(async () => {
    userId = (await createTestUser()).id;
    const company = await createCompany(userId);
    companyId = company.id;
    const job = await createJob(userId, company.id);
    jobId = job.id;
  });

  it("drafts an email and a cover letter grounded in the candidate's real data", async () => {
    const { prepareApplication } = await import("@/lib/services/applications");
    const result = await prepareApplication(userId, jobId);

    expect(result.skipped).toBeFalsy();
    expect(result.application.status).toBe("AWAITING_APPROVAL");

    const db = await testDb();
    const schema = await import("@/lib/db/schema");
    const { eq, desc } = await import("drizzle-orm");

    const [email] = await db
      .select()
      .from(schema.generatedEmails)
      .where(eq(schema.generatedEmails.applicationId, result.application.id))
      .orderBy(desc(schema.generatedEmails.createdAt))
      .limit(1);

    const [letter] = await db
      .select()
      .from(schema.coverLetters)
      .where(eq(schema.coverLetters.applicationId, result.application.id))
      .orderBy(desc(schema.coverLetters.createdAt))
      .limit(1);

    expect(email).toBeTruthy();
    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.body).toContain("Amine Berrada");
    expect(letter.plainText.length).toBeGreaterThan(100);

    // Grounded in the real CV: at least one actual skill of the candidate,
    // and never an unfilled placeholder.
    const combined = `${email.subject} ${email.body} ${letter.plainText}`;
    expect(combined).toMatch(/React|TypeScript|Node\.js/);
    expect(combined).not.toMatch(/\[[a-z ]{3,}\]|\{\{.+\}\}/i);
  });

  it("records a match score with a full breakdown", async () => {
    const db = await testDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const [match] = await db.select().from(schema.jobMatches).where(eq(schema.jobMatches.jobId, jobId)).limit(1);
    expect(match).toBeTruthy();
    expect(match.score).toBeGreaterThan(0);
    expect(match.score).toBeLessThanOrEqual(100);
    expect(Object.keys(match.breakdown ?? {}).length).toBeGreaterThanOrEqual(6);
    expect(match.matchedSkills).toContain("React");
  });

  it("refuses to send before approval", async () => {
    const { prepareApplication, sendApplication } = await import("@/lib/services/applications");
    const prepared = await prepareApplication(userId, jobId, { force: true });

    const outcome = await sendApplication(userId, prepared.application.id);
    expect(outcome.status).toBe("skipped");
    expect(outcome.reason).toMatch(/approval/i);
  });

  it("refuses to send without a connected mailbox and leaves the record untouched", async () => {
    const { approveApplication, prepareApplication, sendApplication } = await import("@/lib/services/applications");
    // A verified public contact exists, so the only thing missing is a mailbox.
    await createContact(userId, companyId);
    const prepared = await prepareApplication(userId, jobId, { force: true });
    await approveApplication(userId, prepared.application.id);

    await expect(sendApplication(userId, prepared.application.id)).rejects.toThrow(/mailbox/i);

    const db = await testDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(schema.applications).where(eq(schema.applications.id, prepared.application.id)).limit(1);

    expect(row.status).toBe("AWAITING_APPROVAL");
    expect(row.sentAt).toBeNull();
  });

  it("is idempotent — re-preparing does not duplicate the application", async () => {
    const { prepareApplication } = await import("@/lib/services/applications");
    const first = await prepareApplication(userId, jobId);
    const second = await prepareApplication(userId, jobId);
    expect(second.application.id).toBe(first.application.id);
  });
});

describe("job deduplication", () => {
  it("stores one row per listing per user", async () => {
    const db = await testDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const userId = (await createTestUser()).id;
    const company = await createCompany(userId);
    const first = await createJob(userId, company.id);

    // Same fingerprint again — must conflict, not duplicate.
    await db
      .insert(schema.jobListings)
      .values({ ...first, id: undefined })
      .onConflictDoNothing()
      .returning();

    const rows = await db.select().from(schema.jobListings).where(eq(schema.jobListings.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("lets two different accounts store the same listing", async () => {
    const userA = (await createTestUser()).id;
    const userB = (await createTestUser()).id;
    const companyA = await createCompany(userA);
    const companyB = await createCompany(userB);

    const jobA = await createJob(userA, companyA.id);
    const jobB = await createJob(userB, companyB.id, { dedupeHash: jobA.dedupeHash });

    expect(jobB.id).not.toBe(jobA.id);
    expect(jobB.dedupeHash).toBe(jobA.dedupeHash);
  });
});

describe("demo data", () => {
  it("seeds a coherent pipeline and is safe to run twice", async () => {
    const { seedDemoData } = await import("@/lib/services/demo");
    const userId = (await createTestUser()).id;

    const first = await seedDemoData(userId);
    expect(first.companies).toBeGreaterThan(0);
    expect(first.jobs).toBeGreaterThan(0);
    expect(first.applications).toBeGreaterThan(0);

    const second = await seedDemoData(userId);
    // Idempotent: nothing is duplicated on a second run.
    expect(second.companies).toBe(0);
    expect(second.jobs).toBe(0);
  });

  it("gives every seeded contact a source URL and a verification state", async () => {
    const db = await testDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { seedDemoData } = await import("@/lib/services/demo");

    const userId = (await createTestUser()).id;
    await seedDemoData(userId);

    const { listContacts } = await import("@/lib/services/companies");
    const { listCompanies } = await import("@/lib/services/companies");
    const companies = await listCompanies(userId);
    const contacts = (await Promise.all(companies.map((company) => listContacts(userId, company.id)))).flat();
    expect(contacts.length).toBeGreaterThan(0);
    for (const contact of contacts) {
      expect(contact.sourceUrl).toMatch(/^https?:\/\//);
      expect(contact.verification).toBeTruthy();
      expect(contact.confidence).toBeGreaterThan(0);
      expect(contact.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("pipeline statistics", () => {
  it("counts applications by status for a single user only", async () => {
    const { getPipelineStats } = await import("@/lib/services/applications");

    const userA = (await createTestUser()).id;
    const userB = (await createTestUser()).id;
    const companyA = await createCompany(userA);
    const jobA = await createJob(userA, companyA.id);

    const { prepareApplication } = await import("@/lib/services/applications");
    await prepareApplication(userA, jobA.id);

    const statsA = await getPipelineStats(userA);
    const statsB = await getPipelineStats(userB);

    expect(statsA.total).toBeGreaterThanOrEqual(1);
    expect(statsB.total).toBe(0);
  });
});

describe("send failure reporting", () => {
  it("records why a send failed on the application and clears it on success", async () => {
    const db = await testDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { approveApplication, prepareApplication, sendApplication } = await import("@/lib/services/applications");

    const userId = (await createTestUser()).id;
    const company = await createCompany(userId);
    await createContact(userId, company.id);
    const job = await createJob(userId, company.id);

    const prepared = await prepareApplication(userId, job.id);
    await approveApplication(userId, prepared.application.id);

    // A mailbox that exists but whose token cannot be used: the failure must be
    // persisted so the UI can explain it instead of silently staying queued.
    await db.insert(schema.emailConnections).values({
      userId,
      provider: "GOOGLE",
      emailAddress: "amine@example.com",
      displayName: "Amine Berrada",
      accessTokenEnc: "not-a-valid-ciphertext",
      refreshTokenEnc: "not-a-valid-ciphertext",
      tokenIv: "00000000000000000000000000000000",
      tokenTag: "00000000000000000000000000000000",
      status: "CONNECTED",
      dailyLimit: 10,
    });

    await expect(sendApplication(userId, prepared.application.id)).rejects.toThrow();

    const [afterFailure] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, prepared.application.id))
      .limit(1);

    expect(afterFailure.lastError).toBeTruthy();
    expect(afterFailure.status).toBe("AWAITING_APPROVAL");
    expect(afterFailure.sentAt).toBeNull();

    // Approving again clears the error so a stale message never lingers.
    await approveApplication(userId, prepared.application.id);
    const [afterApproval] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, prepared.application.id))
      .limit(1);
    expect(afterApproval.lastError).toBeNull();
  });
});
