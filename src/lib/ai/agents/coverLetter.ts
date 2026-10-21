import { complete, isAIUnavailable } from "../client";
import { PROMPT, SYSTEM } from "../prompts";
import { escapeHtml, htmlToText, personalizationScore, qualityScore, wordCount } from "../quality";
import type { CandidateProfile, Company, JobListing } from "@/lib/db/schema";

export type CoverLetterInput = {
  profile: CandidateProfile;
  job: JobListing;
  company: Company;
  language: "en" | "fr";
  style: "PROFESSIONAL" | "STORYTELLING" | "IMPACT" | "ACADEMIC";
};

export type CoverLetterDraft = {
  title: string;
  content: string; // HTML (rich text editor + export)
  plainText: string;
  personalizationScore: number;
  qualityScore: number;
  wordCount: number;
  model: string;
  source: "ai" | "heuristic";
  latencyMs: number;
};

function p(text: string) {
  return `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;
}

function pickExperience(profile: CandidateProfile, job: JobListing) {
  const skills = new Set((job.skills ?? []).map((s) => s.toLowerCase()));
  const entries = [...(profile.experience ?? [])];
  if (!entries.length) return [];
  const scored = entries.map((entry) => {
    const haystack = `${entry.title} ${entry.description ?? ""} ${(entry.highlights ?? []).join(" ")}`.toLowerCase();
    const overlap = [...skills].filter((s) => haystack.includes(s)).length;
    return { entry, overlap };
  });
  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, 2).map((s) => s.entry);
}

function heuristicLetter(input: CoverLetterInput): { title: string; content: string; plainText: string } {
  const { profile, job, company, language, style } = input;
  const name = profile.fullName ?? (language === "fr" ? "Votre candidat" : "Your candidate");
  const title =
    language === "fr"
      ? `Lettre de motivation — ${job.title} — ${company.name}`
      : `Cover letter — ${job.title} — ${company.name}`;

  const companyFocus =
    (company.description && company.description.length > 40
      ? company.description
      : (company.technologies ?? []).slice(0, 5).join(", ")) || company.industry || "";

  const entries = pickExperience(profile, job);
  const fr = language === "fr";

  const opening = fr
    ? `Je candidate au poste de ${job.title} au sein de ${company.name}${job.location ? ` (${job.location})` : ""}. ${
        companyFocus
          ? `${company.name} — ${companyFocus.slice(0, 200).replace(/\s+\S*$/, "")} — correspond à la trajectoire que je construis depuis ${Math.max(profile.yearsExperience, 1)} an(s).`
          : `Depuis ${Math.max(profile.yearsExperience, 1)} an(s), je construis une expérience directement transposable sur ce poste.`
      }`
    : `I am applying for the ${job.title} role at ${company.name}${job.location ? ` (${job.location})` : ""}. ${
        companyFocus
          ? `What ${company.name} is building — ${companyFocus.slice(0, 200).replace(/\s+\S*$/, "")} — is exactly the kind of environment where my last ${Math.max(profile.yearsExperience, 1)} year(s) of work compounds.`
          : `My last ${Math.max(profile.yearsExperience, 1)} year(s) map directly onto the responsibilities of this role.`
      }`;

  const evidence = entries
    .map((entry) => {
      const period = [entry.startDate, entry.endDate].filter(Boolean).join(" – ");
      const detail = (entry.highlights ?? []).filter(Boolean)[0] ?? entry.description ?? "";
      return fr
        ? `En tant que ${entry.title} chez ${entry.company}${period ? ` (${period})` : ""}, ${detail ? detail.slice(0, 320) : "j'ai piloté des projets au plus près des besoins métiers."}`
        : `As ${entry.title} at ${entry.company}${period ? ` (${period})` : ""}, ${detail ? detail.slice(0, 320) : "I owned delivery end to end, close to the business."}`;
    })
    .filter(Boolean);

  const fallbackEvidence = fr
    ? `Mon parcours s'appuie sur ${(profile.skills ?? []).slice(0, 6).join(", ") || "des compétences techniques transférables"}, que je mobilise sur des sujets comparables à ceux de ce poste.`
    : `My work is built on ${(profile.skills ?? []).slice(0, 6).join(", ") || "transferable technical skills"}, which I apply to problems comparable to the ones in this role.`;

  const motivation = (() => {
    switch (style) {
      case "IMPACT":
        return fr
          ? `Ce qui m'intéresse ici, c'est l'impact mesurable : réduire les cycles, fiabiliser les livraisons, rendre les équipes plus autonomes. C'est ce que j'ai fait jusqu'ici et ce que je veux continuer à faire à plus grande échelle.`
          : `What motivates me is measurable impact: shortening cycles, making delivery predictable, and leaving teams more autonomous than I found them. That is the work I have done so far and want to keep doing at a larger scale.`;
      case "STORYTELLING":
        return fr
          ? `Mon parcours est fait de transitions assumées : chaque étape m'a rapproché des sujets que traite aujourd'hui ${company.name}. Ce poste est la suite logique de ce fil conducteur.`
          : `My path has been a deliberate sequence of steps toward the problems ${company.name} works on today. This role is the natural next chapter of that thread.`;
      case "ACADEMIC":
        return fr
          ? `Ma formation et mes expériences se complètent : la rigueur acquise en formation encadre une pratique professionnelle orientée vers la qualité et la reproductibilité des résultats.`
          : `My education and practice reinforce each other: academic rigour frames a professional habit of reproducible, well-documented results.`;
      default:
        return fr
          ? `Je recherche une équipe exigeante où la qualité du travail compte autant que la vitesse, et où l'on assume ses décisions techniques. ${company.name} correspond à cette description.`
          : `I am looking for a demanding team where craft matters as much as speed and where technical decisions are owned. ${company.name} fits that description.`;
    }
  })();

  const closing = fr
    ? `Je serais heureux d'échanger de vive voix sur ce que je peux apporter à ${company.name}. Mon CV détaille l'ensemble de mes missions et résultats.`
    : `I would welcome a conversation about what I can contribute to ${company.name}. My CV details the full scope of my work and results.`;

  const signature = [name, [profile.phone, profile.email].filter(Boolean).join(" · "), profile.linkedinUrl]
    .filter(Boolean)
    .join("\n");

  const html = [
    p(opening),
    ...(evidence.length ? evidence.map(p) : [p(fallbackEvidence)]),
    p(motivation),
    p(closing),
    `<p>${escapeHtml(signature).replace(/\n/g, "<br />")}</p>`,
  ].join("\n");

  return { title, content: html, plainText: htmlToText(html) };
}

/**
 * Cover Letter Agent — one unique letter per company + position.
 * Grounded strictly on parsed CV data and researched company facts.
 */
export async function draftCoverLetter(input: CoverLetterInput): Promise<CoverLetterDraft> {
  const started = Date.now();
  const fallback = heuristicLetter(input);
  let { title, content, plainText } = fallback;
  let model = "fallback-heuristic";
  let source: "ai" | "heuristic" = "heuristic";

  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await complete<{ title?: string; content?: string }>({
        system: SYSTEM.coverLetter,
        user: PROMPT.coverLetter({
          candidate: {
            fullName: input.profile.fullName,
            headline: input.profile.headline,
            summary: input.profile.summary,
            yearsExperience: input.profile.yearsExperience,
            skills: input.profile.skills,
            experience: (input.profile.experience ?? []).slice(0, 4),
            education: (input.profile.education ?? []).slice(0, 3),
            achievements: input.profile.achievements,
            projects: (input.profile.projects ?? []).slice(0, 3),
            languages: input.profile.languages,
          },
          company: {
            name: input.company.name,
            website: input.company.website,
            industry: input.company.industry,
            description: input.company.description,
            technologies: input.company.technologies,
            headquarters: input.company.headquarters,
          },
          job: {
            title: input.job.title,
            location: input.job.location,
            remote: input.job.remote,
            description: input.job.description.slice(0, 4000),
            requirements: input.job.requirements,
            skills: input.job.skills,
          },
          language: input.language,
          style: input.style,
        }),
        temperature: 0.7,
        maxTokens: 2200,
      });

      if (result.data.content) {
        title = result.data.title?.trim() || title;
        content = result.data.content.trim();
        plainText = htmlToText(content);
        model = result.model;
        source = "ai";
      }
    } catch (error) {
      if (!isAIUnavailable(error)) console.warn("[cover-letter] LLM generation failed, using deterministic engine:", error);
    }
  }

  const text = htmlToText(content);
  const tokens = [
    input.company.name,
    input.job.title,
    input.job.location,
    ...(input.job.skills ?? []).slice(0, 5),
    ...(input.company.technologies ?? []).slice(0, 3),
  ];

  return {
    title,
    content,
    plainText: plainText || text,
    personalizationScore: personalizationScore(text, tokens),
    qualityScore: qualityScore(text, { minWords: 180, maxWords: 520 }),
    wordCount: wordCount(text),
    model,
    source,
    latencyMs: Date.now() - started,
  };
}
