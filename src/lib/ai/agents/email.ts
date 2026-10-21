import { complete, isAIUnavailable } from "../client";
import { PROMPT, SYSTEM } from "../prompts";
import { htmlToText, personalizationScore, qualityScore } from "../quality";
import type { CandidateProfile, Company, JobListing } from "@/lib/db/schema";

export type EmailDraftInput = {
  profile: CandidateProfile;
  job: JobListing;
  company: Company;
  contactName?: string | null;
  recipientEmail?: string | null;
  tone: "FORMAL" | "PROFESSIONAL" | "FRIENDLY" | "CONCISE";
  language: "en" | "fr";
  extraContext?: string | null;
};

export type EmailDraft = {
  subject: string;
  body: string;
  highlights: string[];
  personalizationScore: number;
  qualityScore: number;
  model: string;
  source: "ai" | "heuristic";
  latencyMs: number;
};

/** Pulls real, non-invented proof points from the parsed CV. */
function candidateHighlights(profile: CandidateProfile, job: JobListing, language: "en" | "fr"): string[] {
  const highlights: string[] = [];
  const jobSkills = new Set((job.skills ?? []).map((s) => s.toLowerCase()));

  for (const entry of (profile.experience ?? []).slice(0, 3)) {
    const bullets = (entry.highlights ?? []).filter(Boolean);
    if (bullets.length) {
      highlights.push(...bullets.slice(0, 2));
      continue;
    }
    if (entry.description) {
      highlights.push(
        `${entry.title} at ${entry.company}${entry.startDate ? ` (${entry.startDate}${entry.endDate ? ` – ${entry.endDate}` : ""})` : ""}: ${entry.description}`,
      );
    }
  }

  if (!highlights.length) {
    const skills = (profile.skills ?? []).filter((s) => jobSkills.has(s.toLowerCase()));
    const pool = skills.length ? skills : (profile.skills ?? []);
    if (pool.length) {
      highlights.push(
        language === "fr"
          ? `Pratique quotidienne de ${pool.slice(0, 5).join(", ")} sur mes derniers projets.`
          : `Hands-on, day-to-day work with ${pool.slice(0, 5).join(", ")} across my recent projects.`,
      );
    }
  }

  if (!highlights.length && (profile.achievements ?? []).length) {
    highlights.push(...(profile.achievements ?? []).slice(0, 2));
  }

  if (!highlights.length) {
    highlights.push(
      language === "fr"
        ? `${profile.yearsExperience} années d'expérience sur des missions ${(profile.headline ?? "techniques").toLowerCase()}.`
        : `${profile.yearsExperience} years of experience across ${(profile.headline ?? "technical").toLowerCase()} work.`,
    );
  }

  return highlights.slice(0, 4);
}

function greeting(tone: string, contactName: string | null, companyName: string, language: "en" | "fr") {
  if (language === "fr") {
    if (contactName) return tone === "FORMAL" ? `Madame, Monsieur ${contactName},` : `Bonjour ${contactName},`;
    return tone === "FORMAL" ? "Madame, Monsieur," : `Bonjour l'équipe recrutement de ${companyName},`;
  }
  if (contactName) return tone === "FORMAL" ? `Dear ${contactName},` : `Hi ${contactName},`;
  return tone === "FORMAL" ? "Dear Hiring Team," : `Hi ${companyName} team,`;
}

function signOff(tone: string, language: "en" | "fr") {
  if (language === "fr") return tone === "FORMAL" ? "Bien cordialement," : "Bonne journée,";
  return tone === "FORMAL" ? "Yours sincerely," : "Best regards,";
}

function subjectLine(input: EmailDraftInput): string {
  const { job, company, profile, tone, language } = input;
  const name = profile.fullName ?? "Candidate";
  if (language === "fr") {
    switch (tone) {
      case "FORMAL":
        return `Candidature au poste de ${job.title} – ${name}`;
      case "FRIENDLY":
        return `${job.title} chez ${company.name} — ${name}`;
      case "CONCISE":
        return `Candidature – ${job.title} – ${name}`;
      default:
        return `Candidature : ${job.title} (${company.name}) – ${name}`;
    }
  }
  switch (tone) {
    case "FORMAL":
      return `Application for the ${job.title} position – ${name}`;
    case "FRIENDLY":
      return `${job.title} at ${company.name} — ${name}`;
    case "CONCISE":
      return `Application – ${job.title} – ${name}`;
    default:
      return `Application: ${job.title} (${company.name}) – ${name}`;
  }
}

function heuristicBody(input: EmailDraftInput, highlights: string[]): string {
  const { profile, job, company, tone, language, extraContext } = input;
  const name = profile.fullName ?? (language === "fr" ? "le candidat" : "the candidate");
  const headline = profile.headline ?? profile.currentTitle ?? (language === "fr" ? "professionnel" : "professional");
  const location = job.location ? (language === "fr" ? ` à ${job.location}` : ` in ${job.location}`) : "";
  const remote = job.remote === "REMOTE" ? (language === "fr" ? " en télétravail" : " remotely") : "";
  const bullets = highlights.map((h) => `• ${h.replace(/\s+/g, " ").trim()}`).join("\n");

  const companyHook =
    (company.description && company.description.length > 40
      ? company.description
      : (company.technologies ?? []).slice(0, 4).join(", ")) || null;

  if (language === "fr") {
    const hook = companyHook
      ? `Ce qui m'a attiré chez ${company.name} : ${companyHook.slice(0, 220).replace(/\s+\S*$/, "")}.`
      : `Le positionnement de ${company.name} correspond à la trajectoire que je souhaite donner à la suite de mon parcours.`;
    return [
      greeting(tone, input.contactName ?? null, company.name, language),
      "",
      `Je vous adresse ma candidature pour le poste de ${job.title}${location}${remote}. ${profile.yearsExperience} années d'expérience comme ${headline} m'ont appris à livrer des résultats concrets sur des sujets proches de ceux de votre équipe.`,
      "",
      hook,
      "",
      "Ce que je peux apporter :",
      bullets,
      "",
      extraContext ? `${extraContext}` : "",
      extraContext ? "" : "",
      `Vous trouverez mon CV en pièce jointe, avec le détail de mes missions et résultats. Je serais ravi d'échanger sur la façon dont je peux contribuer aux prochains chantiers de ${company.name}.`,
      "",
      signOff(tone, language),
      name,
      [profile.phone, profile.email].filter(Boolean).join(" · "),
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  }

  const hook = companyHook
    ? `What drew me to ${company.name}: ${companyHook.slice(0, 220).replace(/\s+\S*$/, "")}.`
    : `${company.name}'s direction matches the kind of problems I want to keep working on.`;

  return [
    greeting(tone, input.contactName ?? null, company.name, language),
    "",
    `I'm applying for the ${job.title} role${location}${remote}. With ${profile.yearsExperience} years of experience as ${headline}, I've shipped work that maps closely to what your team is building.`,
    "",
    hook,
    "",
    "What I'd bring:",
    bullets,
    "",
    extraContext ? `${extraContext}` : "",
    extraContext ? "" : "",
    `My CV is attached with the full detail of my work and results. I'd welcome a short conversation about how I can help ${company.name} move its next milestones forward.`,
    "",
    signOff(tone, language),
    name,
    [profile.phone, profile.email].filter(Boolean).join(" · "),
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/**
 * Email Writing Agent.
 *
 * Uses the LLM when `OPENAI_API_KEY` is set, otherwise a deterministic, data-grounded
 * composer. Both paths run the same quality + personalization scoring.
 */
export async function draftEmail(input: EmailDraftInput): Promise<EmailDraft> {
  const started = Date.now();
  const highlights = candidateHighlights(input.profile, input.job, input.language);

  let subject = subjectLine(input);
  let body = heuristicBody(input, highlights);
  let model = "fallback-heuristic";
  let source: "ai" | "heuristic" = "heuristic";

  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await complete<{ subject?: string; body?: string; highlights?: string[] }>({
        system: SYSTEM.email,
        user: PROMPT.email({
          candidate: {
            fullName: input.profile.fullName,
            headline: input.profile.headline,
            yearsExperience: input.profile.yearsExperience,
            skills: input.profile.skills,
            experience: (input.profile.experience ?? []).slice(0, 3),
            achievements: input.profile.achievements,
            languages: input.profile.languages,
            city: input.profile.city,
            availabilityWeeks: input.profile.availabilityWeeks,
          },
          company: {
            name: input.company.name,
            website: input.company.website,
            industry: input.company.industry,
            description: input.company.description,
            technologies: input.company.technologies,
          },
          job: {
            title: input.job.title,
            location: input.job.location,
            remote: input.job.remote,
            description: input.job.description.slice(0, 2500),
            skills: input.job.skills,
          },
          tone: input.tone,
          language: input.language,
          extraContext: input.extraContext,
        }),
        temperature: 0.6,
      });

      if (result.data.subject && result.data.body) {
        subject = result.data.subject.trim();
        body = result.data.body.trim();
        model = result.model;
        source = "ai";
        if (Array.isArray(result.data.highlights) && result.data.highlights.length) highlights.splice(0, highlights.length, ...result.data.highlights.slice(0, 4));
      }
    } catch (error) {
      if (!isAIUnavailable(error)) console.warn("[email] LLM generation failed, using deterministic engine:", error);
    }
  }

  const tokens = [
    input.company.name,
    input.job.title,
    input.job.location,
    input.contactName,
    ...(input.job.skills ?? []).slice(0, 5),
    ...(input.company.technologies ?? []).slice(0, 3),
  ];

  return {
    subject,
    body,
    highlights,
    personalizationScore: personalizationScore(`${subject}\n${body}`, tokens),
    qualityScore: qualityScore(htmlToText(body), { minWords: 70, maxWords: 260 }),
    model,
    source,
    latencyMs: Date.now() - started,
  };
}
