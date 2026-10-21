/**
 * Versioned prompt library.
 *
 * Every prompt declares `PROMPT_VERSION` in its output metadata so generations can be
 * traced, evaluated and rolled back. Grounding rules are identical across prompts:
 * never invent facts, contacts, qualifications or achievements.
 */

import { PROMPT_VERSION } from "./client";

const GROUNDING = `
GROUNDING RULES (non-negotiable):
- Use ONLY information present in the provided context (CV, job description, company research).
- Never invent qualifications, employers, dates, certifications, achievements or metrics.
- Never invent email addresses, names of people, or URLs. If a fact is unknown, omit it.
- Never write mass-marketing language, hyperbolic claims or unverifiable superlatives.
- Keep the candidate's real experience front and centre; generic filler is a failure.
`.trim();

export const SYSTEM = {
  cvAnalysis: `You are the ApplyPilot AI CV Analysis Agent. Extract a structured profile from a CV.
${GROUNDING}
Return strict JSON. Dates stay as written in the CV. Skills must appear literally in the CV text.`,

  matching: `You are the ApplyPilot AI Matching Agent. You explain a compatibility score between a candidate and a job.
${GROUNDING}
Return strict JSON with a 2-4 sentence, specific, honest explanation plus the two most important gaps.`,

  email: `You are the ApplyPilot AI Email Writing Agent. You write short, human, high-signal recruitment emails.
Style: professional, concrete, warm but not familiar. 120-190 words. One clear call to action.
${GROUNDING}
Return strict JSON: { "subject": string, "body": string, "highlights": string[] }.
The body must be plain text with paragraphs separated by blank lines — no markdown, no placeholders in brackets.`,

  coverLetter: `You are the ApplyPilot AI Cover Letter Agent. You write one unique motivation letter per company and position.
Structure: opening hook tied to the company, 2 evidence paragraphs drawn from real experience, motivation paragraph, closing with call to action.
${GROUNDING}
Return strict JSON: { "title": string, "content": string } where content is simple HTML
using <p>, <strong>, <ul>, <li> only. 300-420 words.`,

  followUp: `You are the ApplyPilot AI Follow-up Agent. You write one polite, concise follow-up to a recruiter who has not replied.
${GROUNDING}
Return strict JSON: { "subject": string, "body": string }. Max 110 words. Re-state interest, add one new piece of value, no guilt-tripping.`,

  research: `You are the ApplyPilot AI Company Research Agent. You summarise a company from provided public sources.
${GROUNDING}
If the provided sources are empty or unreachable, respond with low confidence, empty contacts, and
"UNVERIFIED" notes instead of guessing. Never fabricate contact details.
Return strict JSON.`,
} as const;

export const PROMPT = {
  cvAnalysis: (cvText: string, language: string) => `
Analyse this CV${language === "fr" ? " (the candidate writes in French — reply in French)" : ""}.

CV TEXT:
"""
${cvText.slice(0, 12000)}
"""

Return JSON matching:
{
  "fullName": string | null,
  "headline": string | null,
  "email": string | null,
  "phone": string | null,
  "city": string | null,
  "country": string | null,
  "linkedinUrl": string | null,
  "githubUrl": string | null,
  "yearsExperience": number,
  "seniority": "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "MANAGER",
  "summary": string,
  "skills": string[],
  "experience": [{ "company": string, "title": string, "startDate": string, "endDate": string, "description": string, "highlights": string[] }],
  "education": [{ "school": string, "degree": string, "field": string, "startYear": string, "endYear": string }],
  "certifications": [{ "name": string, "issuer": string, "year": string }],
  "languages": [{ "name": string, "level": string }],
  "projects": [{ "name": string, "description": string, "link": string, "stack": string[] }],
  "achievements": string[],
  "suggestedTitles": string[],
  "missingSkills": string[],
  "recommendations": string[]
}`.trim(),

  matching: (input: {
    candidate: { headline: string | null; skills: string[]; yearsExperience: number; seniority: string | null };
    job: { title: string; company: string; location: string | null; remote: string; description: string; skills: string[] };
    score: number;
    breakdown: Record<string, number>;
    matched: string[];
    missing: string[];
    language: string;
  }) => `
Candidate: ${input.candidate.headline ?? "Candidate"} — ${input.candidate.yearsExperience} years experience (${input.candidate.seniority ?? "n/a"}).
Candidate skills: ${input.candidate.skills.join(", ") || "none listed"}.

Job: ${input.job.title} @ ${input.job.company} (${input.job.location ?? "unknown"} / ${input.job.remote}).
Job skills: ${input.job.skills.join(", ") || "none listed"}.
Job description: """
${input.job.description.slice(0, 4000)}
"""

Deterministic score: ${input.score}/100
Breakdown (0-1 weights): ${JSON.stringify(input.breakdown)}
Matched skills: ${input.matched.join(", ") || "none"}
Missing skills: ${input.missing.join(", ") || "none"}

${input.language === "fr" ? "Write the explanation in French." : "Write the explanation in English."}

Return JSON: { "explanation": string, "topStrengths": string[], "topGaps": string[] }`.trim(),

  email: (input: {
    candidate: Record<string, unknown>;
    job: Record<string, unknown>;
    company: Record<string, unknown>;
    tone: string;
    language: string;
    extraContext?: string | null;
  }) => `
Write a recruitment email.

TONE: ${input.tone}
LANGUAGE: ${input.language === "fr" ? "French" : "English"}

CANDIDATE:
${JSON.stringify(input.candidate, null, 2).slice(0, 3000)}

COMPANY:
${JSON.stringify(input.company, null, 2).slice(0, 2000)}

JOB:
${JSON.stringify(input.job, null, 2).slice(0, 3000)}

${input.extraContext ? `ADDITIONAL CONTEXT: ${input.extraContext}` : ""}

Return JSON: { "subject": string, "body": string, "highlights": string[] }`.trim(),

  coverLetter: (input: {
    candidate: Record<string, unknown>;
    job: Record<string, unknown>;
    company: Record<string, unknown>;
    language: string;
    style: string;
  }) => `
Write a cover letter.

LANGUAGE: ${input.language === "fr" ? "French" : "English"}
STYLE: ${input.style}

CANDIDATE:
${JSON.stringify(input.candidate, null, 2).slice(0, 3000)}

COMPANY:
${JSON.stringify(input.company, null, 2).slice(0, 2000)}

JOB:
${JSON.stringify(input.job, null, 2).slice(0, 3000)}

Return JSON: { "title": string, "content": string }`.trim(),

  followUp: (input: {
    candidateName: string;
    companyName: string;
    jobTitle: string;
    sentAt: string;
    language: string;
    sequence: number;
  }) => `
Draft follow-up #${input.sequence}. Original application sent ${input.sentAt} for ${input.jobTitle} at ${input.companyName}.
Candidate: ${input.candidateName}. LANGUAGE: ${input.language === "fr" ? "French" : "English"}.
Return JSON: { "subject": string, "body": string }`.trim(),

  research: (input: { company: Record<string, unknown>; sources: { url: string; kind: string; excerpt: string }[] }) => `
Research this company.

COMPANY: ${JSON.stringify(input.company)}

SOURCES (may be empty if unreachable):
${input.sources.map((s) => `- [${s.kind}] ${s.url}\n${s.excerpt.slice(0, 2500)}`).join("\n\n") || "(no live source could be fetched)"}

Return JSON:
{
  "description": string,
  "industry": string | null,
  "size": string | null,
  "headquarters": string | null,
  "technologies": string[],
  "careersUrl": string | null,
  "applicationProcess": string | null,
  "hiringSignals": string[],
  "confidence": number,
  "notes": string
}`.trim(),
} as const;

export { PROMPT_VERSION };
