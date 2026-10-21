import { describe, expect, it } from "vitest";

import { heuristicExplanation, normaliseSkill, scoreJob } from "@/lib/ai/agents/matching";
import type { CandidateProfile, JobListing } from "@/lib/db/schema";

function profile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    fullName: "Amine Berrada",
    headline: "Senior Frontend Engineer",
    email: "amine@example.com",
    phone: null,
    city: "Casablanca",
    country: "Morocco",
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    yearsExperience: 7,
    currentTitle: "Senior Frontend Engineer",
    seniority: "SENIOR",
    summary: null,
    skills: ["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL"],
    experience: [],
    education: [],
    certifications: [],
    languages: [{ name: "English", level: "fluent" }],
    projects: [],
    achievements: [],
    desiredTitles: ["Senior Frontend Engineer"],
    desiredSkills: [],
    desiredLocations: ["Casablanca", "Remote"],
    targetIndustries: [],
    workModes: ["REMOTE", "HYBRID"],
    preferredLanguage: "en",
    minSalary: null,
    maxSalary: null,
    currency: "EUR",
    availabilityWeeks: 0,
    timezone: "Africa/Casablanca",
    automationMode: "ASSISTED",
    autoApplyEnabled: false,
    dailyApplicationLimit: 10,
    completeness: 80,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CandidateProfile;
}

function job(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: "job-1",
    userId: "user-1",
    companyId: "company-1",
    title: "Senior Frontend Engineer",
    location: "Remote",
    remote: "REMOTE",
    seniority: "SENIOR",
    employmentType: "FULL_TIME",
    department: null,
    description: "We are looking for a senior engineer with React, TypeScript and Node.js experience.",
    requirements: ["React", "TypeScript", "Go"],
    skills: ["React", "TypeScript", "Go"],
    salaryMin: null,
    salaryMax: null,
    currency: "EUR",
    source: "GREENHOUSE",
    sourceUrl: "https://example.com/jobs/1",
    externalId: null,
    applyUrl: null,
    postedAt: new Date("2026-01-01T00:00:00Z"),
    language: "en",
    dedupeHash: "hash-1",
    isActive: true,
    discoveredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as JobListing;
}

describe("normaliseSkill", () => {
  it("is case- and accent-insensitive", () => {
    expect(normaliseSkill("React")).toBe(normaliseSkill("react"));
    expect(normaliseSkill("Développement")).toBe(normaliseSkill("developpement"));
  });

  it("keeps meaningful punctuation (c#, node.js)", () => {
    expect(normaliseSkill("C#")).toContain("#");
    expect(normaliseSkill("Node.js")).toContain(".");
  });
});

describe("scoreJob", () => {
  it("returns a score inside 0-100 for any input", () => {
    for (const candidate of [profile(), profile({ skills: [] }), profile({ yearsExperience: 0 })]) {
      for (const listing of [job(), job({ skills: [], requirements: [] }), job({ remote: "ONSITE" })]) {
        const result = scoreJob({ profile: candidate, job: listing });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("never reports a matched skill the candidate does not have", () => {
    const result = scoreJob({ profile: profile(), job: job() });
    const owned = new Set(profile().skills.map((skill) => normaliseSkill(skill)));
    for (const matched of result.matchedSkills) {
      expect(owned.has(normaliseSkill(matched))).toBe(true);
    }
    expect(result.matchedSkills).toContain("React");
    expect(result.matchedSkills).toContain("TypeScript");
  });

  it("surfaces genuine gaps instead of hiding them", () => {
    const result = scoreJob({ profile: profile(), job: job({ skills: ["React", "Go", "Kafka"] }) });
    expect(result.missingSkills).toContain("Go");
    expect(result.missingSkills).toContain("Kafka");
  });

  it("keeps every breakdown dimension normalised between 0 and 1", () => {
    const { breakdown } = scoreJob({ profile: profile(), job: job() });
    for (const value of Object.values(breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("scores a perfect match above a poor one", () => {
    const strong = scoreJob({ profile: profile(), job: job() }).score;
    const weak = scoreJob({
      profile: profile({ skills: ["COBOL"], seniority: "INTERN", yearsExperience: 0, workModes: ["ONSITE"] }),
      job: job({ seniority: "SENIOR", remote: "REMOTE", skills: ["React", "TypeScript"] }),
    }).score;
    expect(strong).toBeGreaterThan(weak);
  });

  it("is deterministic — the same input always scores the same", () => {
    const a = scoreJob({ profile: profile(), job: job() });
    const b = scoreJob({ profile: profile(), job: job() });
    expect(a.score).toBe(b.score);
    expect(a.breakdown).toEqual(b.breakdown);
  });
});

describe("heuristicExplanation", () => {
  it("states the score and names the gaps in the requested language", () => {
    const result = scoreJob({ profile: profile(), job: job() });
    const english = heuristicExplanation(result, { profile: profile(), job: job() }, "en");
    const french = heuristicExplanation(result, { profile: profile(), job: job() }, "fr");

    expect(english).toContain(String(result.score));
    expect(english.toLowerCase()).toContain("go");
    expect(french).toContain(String(result.score));
    expect(english).not.toBe(french);
  });
});
