import { complete, isAIUnavailable } from "../client";
import { PROMPT, SYSTEM } from "../prompts";
import type { CandidateProfile, JobListing } from "@/lib/db/schema";
import { clamp } from "@/lib/utils";

export type MatchInput = {
  profile: CandidateProfile;
  job: JobListing;
  language?: "en" | "fr";
};

export type MatchResult = {
  score: number;
  breakdown: { skills: number; experience: number; location: number; seniority: number; language: number; recency: number };
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
  source: "ai" | "heuristic";
  model: string;
};

const SENIORITY_ORDER = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "MANAGER"] as const;

const SENIORITY_KEYWORDS: Record<string, string[]> = {
  INTERN: ["intern", "stage", "stagiaire", "apprentice", "alternance", "junior intern"],
  JUNIOR: ["junior", "débutant", "debutant", "entry level", "entry-level", "graduate", "jeune diplômé"],
  MID: ["mid", "intermediate", "confirmé", "confirme", "ii ", " 2+", "3+"],
  SENIOR: ["senior", "sr.", "sr ", "expérimenté", "experimente", "5+", "lead developer"],
  LEAD: ["lead", "principal", "staff", "tech lead", "team lead", "responsable"],
  MANAGER: ["manager", "head of", "director", "directeur", "chief", "vp"],
};

/** Normalises a skill for comparison (case, accents, punctuation, plurals). */
export function normaliseSkill(skill: string): string {
  return skill
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#. ]/g, " ")
    .replace(/\b(js|javascript)\b/g, "javascript")
    .replace(/\bts\b/g, "typescript")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSeniority(text: string): (typeof SENIORITY_ORDER)[number] | null {
  const haystack = text.toLowerCase();
  const scores = Object.entries(SENIORITY_KEYWORDS).map(([key, keywords]) => ({
    key: key as (typeof SENIORITY_ORDER)[number],
    hits: keywords.filter((k) => haystack.includes(k)).length,
    weight: SENIORITY_ORDER.indexOf(key as (typeof SENIORITY_ORDER)[number]),
  }));
  const best = scores
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.weight - a.weight)[0];
  return best?.key ?? null;
}

export function extractRequiredYears(text: string): number | null {
  const match = text.match(/(\d{1,2})\s*\+?\s*(?:years|yrs|ans|années|annees)/i);
  if (!match) return null;
  const years = Number(match[1]);
  return Number.isFinite(years) ? clamp(years, 0, 30) : null;
}

function collectJobSkills(job: JobListing): string[] {
  const fromColumns = [...(job.skills ?? []), ...(job.requirements ?? [])];
  if (fromColumns.length) return fromColumns;
  return extractSkillsFromText(job.description);
}

const SKILL_DICTIONARY = [
  "javascript", "typescript", "react", "next.js", "nextjs", "node.js", "nodejs", "python", "django", "fastapi",
  "flask", "java", "spring", "kotlin", "swift", "go", "golang", "rust", "c++", "c#", ".net", "php", "laravel",
  "symfony", "ruby", "rails", "sql", "postgres", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
  "kafka", "graphql", "rest", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible", "ci/cd",
  "git", "linux", "html", "css", "tailwind", "sass", "vue", "angular", "svelte", "react native", "flutter",
  "android", "ios", "machine learning", "deep learning", "nlp", "data analysis", "data engineering", "etl",
  "spark", "airflow", "tableau", "power bi", "excel", "figma", "sketch", "ux", "ui", "seo", "sem", "product management",
  "scrum", "agile", "jira", "salesforce", "hubspot", "sap", "erp", "crm", "cybersecurity", "devops", "sre",
  "microservices", "testing", "jest", "cypress", "playwright", "accessibility", "webpack", "vite", "prisma",
  "drizzle", "stripe", "tailwindcss", "supabase", "firebase",
];

export function extractSkillsFromText(text: string): string[] {
  const haystack = ` ${text.toLowerCase()} `;
  return SKILL_DICTIONARY.filter((skill) => haystack.includes(skill));
}

/**
 * Explainable compatibility score.
 *
 * Deterministic and fully auditable: every sub-score is kept in `breakdown` so the UI can
 * show *why* a job scored the way it did. The optional LLM pass only rewrites the prose
 * explanation — it never changes the numbers.
 */
export function scoreJob({ profile, job, language = "en" }: MatchInput): Omit<MatchResult, "explanation" | "source" | "model"> {
  const candidateSkills = new Map((profile.skills ?? []).map((s) => [normaliseSkill(s), s]));
  const jobSkills = collectJobSkills(job).map((s) => ({ raw: s, norm: normaliseSkill(s) }));

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of jobSkills) {
    const hit = candidateSkills.get(skill.norm) ?? [...candidateSkills.keys()].find((k) => k.includes(skill.norm) || skill.norm.includes(k));
    if (hit) matchedSkills.push(candidateSkills.get(hit) ?? skill.raw);
    else missingSkills.push(skill.raw);
  }

  const skills = jobSkills.length ? clamp(matchedSkills.length / jobSkills.length, 0, 1) : 0.55;

  // ── Experience ────────────────────────────────────────────────
  const requiredYears = extractRequiredYears(`${job.title} ${job.description}`);
  const years = profile.yearsExperience ?? 0;
  const experience = requiredYears
    ? clamp(1 - Math.max(0, requiredYears - years) / Math.max(requiredYears, 1), 0, 1)
    : clamp(years / 6, 0, 1);

  // ── Location & work mode ──────────────────────────────────────
  const preferredModes = (profile.workModes ?? []) as string[];
  let location = preferredModes.includes(job.remote) ? 1 : job.remote === "REMOTE" ? 0.45 : 0.25;
  const desiredLocations = (profile.desiredLocations ?? []).map((l) => l.toLowerCase());
  if (desiredLocations.length && job.location) {
    const jobLocation = job.location.toLowerCase();
    if (desiredLocations.some((l) => jobLocation.includes(l) || l.includes(jobLocation))) location = 1;
  }
  location = clamp(location, 0, 1);

  // ── Seniority ─────────────────────────────────────────────────
  const jobSeniority = job.seniority ?? detectSeniority(`${job.title} ${job.description}`);
  const candidateSeniority = profile.seniority ?? detectSeniority(`${profile.headline ?? ""} ${profile.currentTitle ?? ""}`);
  let seniority = 0.6;
  if (jobSeniority && candidateSeniority) {
    const delta = Math.abs(SENIORITY_ORDER.indexOf(jobSeniority) - SENIORITY_ORDER.indexOf(candidateSeniority));
    seniority = clamp(1 - delta * 0.3, 0, 1);
  } else if (!jobSeniority) {
    seniority = 0.7;
  }

  // ── Language ──────────────────────────────────────────────────
  const languageScore = job.language === (profile.preferredLanguage ?? language) ? 1 : 0.6;

  // ── Recency ───────────────────────────────────────────────────
  const postedAt = job.postedAt ? new Date(job.postedAt).getTime() : Date.now();
  const ageDays = Math.max(0, (Date.now() - postedAt) / 86_400_000);
  const recency = clamp(1 - ageDays / 45, 0, 1);

  const weights = { skills: 0.4, experience: 0.18, location: 0.15, seniority: 0.15, language: 0.05, recency: 0.07 };
  const breakdown = { skills, experience, location, seniority, language: languageScore, recency };
  const score = Math.round(
    (Object.entries(weights) as [keyof typeof weights, number][]).reduce(
      (total, [key, weight]) => total + breakdown[key] * weight,
      0,
    ) * 100,
  );

  return {
    score: clamp(score, 0, 100),
    breakdown,
    matchedSkills: Array.from(new Set(matchedSkills)).slice(0, 30),
    missingSkills: Array.from(new Set(missingSkills)).slice(0, 30),
  };
}

/** Adds a human-readable explanation (LLM when available, deterministic otherwise). */
export async function matchJob(input: MatchInput): Promise<MatchResult> {
  const base = scoreJob(input);
  const { profile, job } = input;
  const lang = input.language ?? profile.preferredLanguage ?? "en";

  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await complete<{ explanation: string }>({
        system: SYSTEM.matching,
        user: PROMPT.matching({
          candidate: {
            headline: profile.headline,
            skills: profile.skills ?? [],
            yearsExperience: profile.yearsExperience,
            seniority: profile.seniority,
          },
          job: {
            title: job.title,
            company: "the company",
            location: job.location,
            remote: job.remote,
            description: job.description,
            skills: job.skills ?? [],
          },
          score: base.score,
          breakdown: base.breakdown,
          matched: base.matchedSkills,
          missing: base.missingSkills,
          language: lang,
        }),
        temperature: 0.3,
      });
      return { ...base, explanation: result.data.explanation?.trim() || heuristicExplanation(base, input, lang), source: "ai", model: result.model };
    } catch (error) {
      if (!isAIUnavailable(error)) console.warn("[matching] LLM explanation failed, using heuristic:", error);
    }
  }

  return { ...base, explanation: heuristicExplanation(base, input, lang), source: "heuristic", model: "fallback-heuristic" };
}

export function heuristicExplanation(
  base: ReturnType<typeof scoreJob>,
  { profile, job }: MatchInput,
  lang: "en" | "fr",
): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const topMatched = base.matchedSkills.slice(0, 4).join(", ");
  const gaps = base.missingSkills.slice(0, 2).join(", ");

  if (lang === "fr") {
    return [
      `Compatibilité ${base.score} % avec le poste de ${job.title}.`,
      `Compétences : ${pct(base.breakdown.skills)} de correspondance${topMatched ? ` (${topMatched})` : ""}.`,
      `Expérience : ${pct(base.breakdown.experience)} — ${profile.yearsExperience} an(s) d'expérience déclarés.`,
      `Localisation / mode de travail : ${pct(base.breakdown.location)} (${job.remote.toLowerCase()}).`,
      gaps ? `Points à renforcer : ${gaps}.` : "Aucun écart majeur détecté sur les compétences demandées.",
    ].join(" ");
  }

  return [
    `${base.score}% compatibility with the ${job.title} role.`,
    `Skills align on ${pct(base.breakdown.skills)} of the requirements${topMatched ? ` (${topMatched})` : ""}.`,
    `Experience match ${pct(base.breakdown.experience)} against ${profile.yearsExperience} years on record.`,
    `Location/work-mode fit ${pct(base.breakdown.location)} (${job.remote.toLowerCase()}).`,
    gaps ? `Gaps to address: ${gaps}.` : "No major gaps against the listed requirements.",
  ].join(" ");
}
