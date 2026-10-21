/**
 * Deterministic quality scoring for generated content.
 *
 * These metrics are computed locally and always run — they do not depend on a model —
 * so the UI can surface an honest personalization / quality score for every draft,
 * including ones produced by the fallback engine.
 */

const SPAM_PHRASES = [
  "dear sir/madam",
  "to whom it may concern",
  "i am writing to inform you",
  "best in class",
  "synergy",
  "think outside the box",
  "go-getter",
  "rockstar",
  "ninja",
  "guru",
  "hard worker",
  "team player",
  "i hope this email finds you well",
  "je me permets de vous contacter",
  "dans l'attente d'une réponse de votre part",
  "veuillez trouver ci-joint",
];

const GENERIC_OPENERS = ["i am writing to apply", "please find attached", "i would like to apply", "je souhaite postuler"];

export function hasPlaceholder(text: string): boolean {
  return /\[[^\]]{2,}\]|\{\{[^}]+\}\}|xxx+/i.test(text);
}

export function countPersonalisationTokens(text: string, tokens: (string | null | undefined)[]): { hits: number; total: number } {
  const haystack = text.toLowerCase();
  const usable = tokens.map((t) => (t ?? "").trim().toLowerCase()).filter((t) => t.length > 2);
  const hits = usable.filter((token) => haystack.includes(token)).length;
  return { hits, total: usable.length };
}

/** 0-100: how specifically the text references the company, role, person and stack. */
export function personalizationScore(text: string, tokens: (string | null | undefined)[]): number {
  const { hits, total } = countPersonalisationTokens(text, tokens);
  if (!total) return 40;
  const base = (hits / total) * 100;
  const bonus = /https?:\/\//.test(text) ? 0 : 4; // no stray links
  const penalty = GENERIC_OPENERS.some((p) => text.toLowerCase().includes(p)) ? 8 : 0;
  return Math.max(0, Math.min(100, Math.round(base + bonus - penalty)));
}

/** 0-100: structural quality — length, readability, tone hygiene, completeness. */
export function qualityScore(text: string, options: { minWords?: number; maxWords?: number } = {}): number {
  const minWords = options.minWords ?? 90;
  const maxWords = options.maxWords ?? 320;
  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const avgSentence = sentences.length ? words.length / sentences.length : words.length;

  let score = 70;

  // Length discipline
  if (words.length < minWords) score -= Math.round(((minWords - words.length) / minWords) * 30);
  if (words.length > maxWords) score -= Math.min(15, Math.round(((words.length - maxWords) / maxWords) * 25));

  // Readability
  if (avgSentence > 28) score -= 8;
  if (avgSentence < 6) score -= 6;

  // Hygiene
  if (hasPlaceholder(text)) score -= 25;
  if (SPAM_PHRASES.some((p) => lower.includes(p))) score -= 18;
  if ((text.match(/!/g) ?? []).length > 1) score -= 6;
  if (/[A-Z]{6,}/.test(text.replace(/\bCV\b|\bHTML\b|\bAPI\b/g, ""))) score -= 5;

  // Completeness signals
  if (/\b(attach|attached|ci-joint|joint)\b/i.test(lower)) score += 6;
  if (/\b(regards|sincerely|best|cordialement|bien à vous|merci)\b/i.test(lower)) score += 4;
  if (sentences.length >= 4) score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Strips HTML tags for plain-text exports (DOCX/PDF) and previews. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
