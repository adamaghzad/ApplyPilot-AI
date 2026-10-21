import { complete, isAIUnavailable } from "../client";
import { PROMPT, SYSTEM } from "../prompts";
import { personalizationScore, qualityScore } from "../quality";
import type { CandidateProfile } from "@/lib/db/schema";
import { aiConfigured } from "@/lib/env";

export type FollowUpInput = {
  profile: CandidateProfile;
  companyName: string;
  jobTitle: string;
  contactName?: string | null;
  sentAt: Date;
  sequence: number;
  language: "en" | "fr";
};

export type FollowUpDraft = {
  subject: string;
  body: string;
  personalizationScore: number;
  qualityScore: number;
  model: string;
  source: "ai" | "heuristic";
};

function heuristic(input: FollowUpInput): { subject: string; body: string } {
  const fr = input.language === "fr";
  const name = input.profile.fullName ?? (fr ? "Le candidat" : "Candidate");
  const greeting = fr
    ? input.contactName
      ? `Bonjour ${input.contactName},`
      : "Bonjour,"
    : input.contactName
      ? `Hi ${input.contactName},`
      : "Hello,";

  const subject = fr
    ? `Suivi – candidature au poste de ${input.jobTitle} – ${name}`
    : `Follow-up – ${input.jobTitle} application – ${name}`;

  const body = fr
    ? [
        greeting,
        "",
        `Je me permets de revenir vers vous au sujet de ma candidature au poste de ${input.jobTitle} chez ${input.companyName}, envoyée le ${input.sentAt.toLocaleDateString("fr-FR")}.`,
        "",
        `Depuis, j'ai continué à travailler sur ${(input.profile.skills ?? []).slice(0, 3).join(", ") || "les sujets liés à ce poste"}, ce qui conforte mon intérêt pour le poste.`,
        "",
        "Si le processus est toujours ouvert, je reste disponible pour un échange rapide. Merci pour votre temps.",
        "",
        "Bien cordialement,",
        name,
      ].join("\n")
    : [
        greeting,
        "",
        `I wanted to follow up on my application for the ${input.jobTitle} role at ${input.companyName}, sent on ${input.sentAt.toLocaleDateString("en-US")}.`,
        "",
        `Since then I've kept working with ${(input.profile.skills ?? []).slice(0, 3).join(", ") || "the stack behind this role"}, which only strengthened my interest in the position.`,
        "",
        "If the process is still open, I'm happy to join a short conversation. Thanks for your time.",
        "",
        "Best regards,",
        name,
      ].join("\n");

  return { subject, body };
}

/** Follow-up Agent — draft only; nothing is ever sent without user approval. */
export async function draftFollowUp(input: FollowUpInput): Promise<FollowUpDraft> {
  const fallback = heuristic(input);
  let result = fallback;
  let model = "fallback-heuristic";
  let source: "ai" | "heuristic" = "heuristic";

  if (aiConfigured) {
    try {
      const completion = await complete<{ subject?: string; body?: string }>({
        system: SYSTEM.followUp,
        user: PROMPT.followUp({
          candidateName: input.profile.fullName ?? "Candidate",
          companyName: input.companyName,
          jobTitle: input.jobTitle,
          sentAt: input.sentAt.toISOString().slice(0, 10),
          language: input.language,
          sequence: input.sequence,
        }),
        temperature: 0.6,
        maxTokens: 700,
      });
      if (completion.data.subject && completion.data.body) {
        result = { subject: completion.data.subject.trim(), body: completion.data.body.trim() };
        model = completion.model;
        source = "ai";
      }
    } catch (error) {
      if (!isAIUnavailable(error)) console.warn("[follow-up] LLM generation failed, using deterministic engine:", error);
    }
  }

  return {
    ...result,
    personalizationScore: personalizationScore(`${result.subject}\n${result.body}`, [
      input.companyName,
      input.jobTitle,
      input.contactName,
    ]),
    qualityScore: qualityScore(result.body, { minWords: 40, maxWords: 160 }),
    model,
    source,
  };
}
