/**
 * Test harness for database-backed suites.
 *
 * Uses PGlite in memory (`DATABASE_URL=memory://`), applies the real SQL
 * migrations from `drizzle/`, and seeds a user + candidate profile. No network,
 * no Postgres server, no files written to disk.
 */
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL = "memory://";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.STORAGE_DIR = "./.tmp-test-storage";

export type TestUser = { id: string; email: string };

let dbModule: typeof import("@/lib/db") | null = null;
let ready = false;

export async function testDb() {
  if (!dbModule) dbModule = await import("@/lib/db");
  if (!ready) {
    await dbModule.dbReady();
    ready = true;
  }
  return dbModule.getDb();
}

/** Creates a user with a completed profile, ready for the services under test. */
export async function createTestUser(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  const db = await testDb();
  const schema = await import("@/lib/db/schema");
  const { hashPassword } = await import("@/lib/crypto");

  const id = randomUUID();
  const email = `test-${id.slice(0, 8)}@example.com`;

  await db.insert(schema.users).values({
    id,
    email,
    name: "Test Candidate",
    passwordHash: await hashPassword("password123"),
    locale: "en",
    timezone: "UTC",
    onboardingCompleted: true,
  });

  await db.insert(schema.candidateProfiles).values({
    userId: id,
    fullName: "Amine Berrada",
    headline: "Senior Frontend Engineer",
    email,
    city: "Casablanca",
    country: "Morocco",
    yearsExperience: 7,
    currentTitle: "Senior Frontend Engineer",
    seniority: "SENIOR",
    skills: ["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL"],
    languages: [{ name: "English", level: "fluent" }],
    experience: [{ company: "Maroc Telecom Digital", title: "Senior Frontend Engineer", startDate: "2021" }],
    achievements: ["Led migration of a 200-page React app to Next.js with TypeScript"],
    desiredTitles: ["Senior Frontend Engineer", "Frontend Engineer"],
    desiredLocations: ["Casablanca", "Remote"],
    workModes: ["REMOTE", "HYBRID"],
    preferredLanguage: "en",
    automationMode: "ASSISTED",
    dailyApplicationLimit: 10,
    ...overrides,
  });

  return { id, email };
}

export async function createCompany(userId: string, name = "Nortex Systems", website = "https://nortex.example.com") {
  const db = await testDb();
  const schema = await import("@/lib/db/schema");
  const [company] = await db
    .insert(schema.companies)
    .values({ userId, name, website, researchStatus: "READY" })
    .returning();
  return company;
}

export async function createJob(
  userId: string,
  companyId: string,
  overrides: Record<string, unknown> = {},
) {
  const db = await testDb();
  const schema = await import("@/lib/db/schema");
  const { jobFingerprint } = await import("@/lib/utils");

  const title = String(overrides.title ?? "Senior Frontend Engineer");
  const fingerprint = String(
    overrides.dedupeHash ??
      jobFingerprint({ company: "Nortex Systems", title, location: "Casablanca", source: "GREENHOUSE" }),
  );

  const [job] = await db
    .insert(schema.jobListings)
    .values({
      userId,
      companyId,
      title,
      location: "Casablanca",
      remote: "REMOTE",
      seniority: "SENIOR",
      employmentType: "FULL_TIME",
      description: "We are hiring a senior engineer with React, TypeScript and Node.js experience.",
      skills: ["React", "TypeScript", "Node.js"],
      requirements: ["React", "TypeScript", "Node.js"],
      source: "GREENHOUSE",
      sourceUrl: `https://nortex.example.com/jobs/${fingerprint}`,
      postedAt: new Date(),
      dedupeHash: fingerprint,
      ...overrides,
    })
    .returning();
  return job;
}

export async function countRows(table: unknown): Promise<number> {
  const db = await testDb();
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute<{ count: number }>(sql.raw(`select count(*)::int as count from "${String(table)}"`));
  return ((rows as unknown as { rows?: { count: number }[] }).rows ?? [])[0]?.count ?? 0;
}

/** A publicly sourced contact — every seeded address carries its provenance. */
export async function createContact(
  userId: string,
  companyId: string,
  email = "careers@nortex.example.com",
  overrides: Record<string, unknown> = {},
) {
  const db = await testDb();
  const schema = await import("@/lib/db/schema");
  const [contact] = await db
    .insert(schema.recruiterContacts)
    .values({
      companyId,
      email,
      role: "Talent Acquisition",
      sourceUrl: "https://nortex.example.com/careers",
      sourceType: "CAREERS_PAGE",
      confidence: 0.85,
      verification: "VERIFIED_PUBLIC",
      ...overrides,
    })
    .returning();
  return contact;
}
