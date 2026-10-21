import { aiConfigured } from "@/lib/env";
/**
 * CV parsing: PDF / DOCX → text → structured profile.
 *
 * Two layers:
 *  1. Rule-based extraction (always runs, fully deterministic).
 *  2. Optional LLM structuring (`OPENAI_API_KEY`) that refines the same evidence.
 *
 * Neither layer invents anything: skills, employers and dates must appear in the
 * document text. Unknown fields stay null.
 */

import type { CertificationEntry, EducationEntry, ExperienceEntry, LanguageEntry, ProjectEntry } from "@/lib/db/schema";

export type ParsedCV = {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  yearsExperience: number;
  seniority: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "MANAGER" | null;
  summary: string;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  languages: LanguageEntry[];
  projects: ProjectEntry[];
  achievements: string[];
  suggestedTitles: string[];
  missingSkills: string[];
  recommendations: string[];
  rawLength: number;
};

/**
 * PDF → text, without native or bundler-sensitive dependencies.
 *
 * Most CVs are produced by Word, LibreOffice, LaTeX or design tools, which store page
 * content in Flate-compressed streams using the standard Tj / TJ text operators. We
 * inflate those streams and decode the strings ourselves — deterministic, dependency
 * free, and immune to the bundler issues that affect pdf.js-based parsers.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const zlib = await import("node:zlib");
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];

  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw))) {
    const contentStart = match.index + match[0].length;
    const endIndex = raw.indexOf("endstream", contentStart);
    if (endIndex === -1) continue;

    // Look back at the object dictionary to see which filters are applied.
    const dictStart = Math.max(0, match.index - 1200);
    const dict = raw.slice(dictStart, match.index);
    const isFlate = /\/FlateDecode/.test(dict);

    const slice = Buffer.from(raw.slice(contentStart, endIndex), "latin1");
    let content: string;
    try {
      content = isFlate ? zlib.inflateSync(slice).toString("latin1") : slice.toString("latin1");
    } catch {
      try {
        content = zlib.inflateRawSync(slice).toString("latin1");
      } catch {
        continue;
      }
    }
    if (content.length) chunks.push(content);
    streamRegex.lastIndex = endIndex + 9;
  }

  const decoded = chunks.map(decodePdfContentStream).filter(Boolean).join("\n");
  if (decoded.trim().length >= 20) return normaliseExtractedText(decoded);

  // Last resort: pull any literal strings out of the raw file.
  const loose = decodePdfContentStream(raw);
  return normaliseExtractedText(loose || decoded);
}

/** Decodes Tj/TJ/'/" text-showing operators from a PDF content stream. */
function decodePdfContentStream(content: string): string {
  const out: string[] = [];

  const pushString = (literal: string) => {
    const decoded = decodePdfString(literal);
    if (decoded) out.push(decoded);
  };

  const patterns: [RegExp, number][] = [
    [/\((?:\\.|[^\\()])*\)/g, 0], // (text)
  ];

  // Walk the stream in order, emitting text for each operator and line breaks for
  // positioning operators so the resulting layout resembles the original document.
  const tokenRegex =
    /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[(?:[^[\]]|\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>)*\]\s*TJ|ET|T[dDm*]|TJ|Tj|'|"/g;
  let token: RegExpExecArray | null;
  while ((token = tokenRegex.exec(content))) {
    const value = token[0];
    if (value.startsWith("(") || value.startsWith("<")) {
      pushString(value);
    } else if (value.startsWith("[")) {
      for (const inner of value.matchAll(/\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>/g)) pushString(inner[0]);
      out.push("\n");
    } else if (value === "TJ" || value === "Tj" || value === "'" || value === '"') {
      out.push("\n");
    } else if (/^T[dDm*]$/.test(value)) {
      out.push("\n");
    } else if (value === "ET") {
      out.push("\n\n");
    }
  }

  if (!out.length) {
    for (const pattern of patterns) {
      for (const literal of content.matchAll(pattern[0])) pushString(literal[0]);
    }
  }

  return out.join("");
}

/** Unescapes PDF literal strings ((, ), \n, octal codes, ligature mappings). */
function decodePdfString(literal: string): string {
  // Hex strings: <48656C6C6F> (latin1) or <FEFF...> (UTF-16BE with BOM).
  if (literal.startsWith("<")) {
    const hex = literal.slice(1, -1).replace(/\s+/g, "");
    if (!hex || hex.length % 2 !== 0) return "";
    const bytes = Buffer.from(hex, "hex");
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return swapUtf16Be(bytes.slice(2)).replace(/\u0000/g, "");
    }
    return bytes.toString("latin1");
  }

  const body = literal.slice(1, -1);
  let result = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char !== "\\") {
      result += char;
      continue;
    }
    const next = body[i + 1];
    if (!next) break;
    switch (next) {
      case "n":
        result += "\n";
        i += 1;
        break;
      case "r":
        result += "\r";
        i += 1;
        break;
      case "t":
        result += "\t";
        i += 1;
        break;
      case "b":
        result += "\b";
        i += 1;
        break;
      case "f":
        result += "\f";
        i += 1;
        break;
      case "(":
      case ")":
      case "\\":
        result += next;
        i += 1;
        break;
      default: {
        const octal = body.slice(i + 1, i + 4);
        if (/^[0-7]{1,3}$/.test(octal)) {
          result += String.fromCharCode(parseInt(octal, 8));
          i += octal.length;
        } else {
          i += 1;
        }
      }
    }
  }
  return result.replace(/\u0000/g, "");
}

/** Buffers encoded as UTF-16BE arrive byte-swapped in most PDF producers. */
function swapUtf16Be(buffer: Buffer): string {
  const swapped = Buffer.alloc(buffer.length);
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    swapped[i] = buffer[i + 1];
    swapped[i + 1] = buffer[i];
  }
  return swapped.toString("utf16le");
}

function normaliseExtractedText(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter((line, index, array) => line.length > 0 || (index > 0 && array[index - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result?.value ?? "").trim();
}

export async function extractCvText(file: { buffer: Buffer; mimeType: string; fileName: string }): Promise<string> {
  const isPdf = file.mimeType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf");
  if (isPdf) return extractPdfText(file.buffer);

  const isDocx =
    file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.fileName.toLowerCase().endsWith(".docx");
  if (isDocx) return extractDocxText(file.buffer);

  // Plain text / markdown fallback
  return file.buffer.toString("utf8");
}

// ─────────────────────────────────────────────────────────────
// Rule-based extraction
// ─────────────────────────────────────────────────────────────

const SECTION_HEADINGS: { key: keyof Pick<ParsedCV, "experience" | "education" | "skills" | "certifications" | "languages" | "projects" | "achievements">; patterns: RegExp[] }[] = [
  { key: "experience", patterns: [/^\s*(professional\s+)?experience/i, /^\s*exp[ée]rience(s)?\s*(professionnelle)?/i, /^\s*work\s+history/i, /^\s*parcours\s+professionnel/i, /^\s*emploi/i] },
  { key: "education", patterns: [/^\s*education/i, /^\s*formation/i, /^\s*academic/i, /^\s*dipl[oô]mes/i, /^\s*studies/i] },
  { key: "skills", patterns: [/^\s*(technical\s+)?skills/i, /^\s*comp[ée]tences/i, /^\s*technologies/i, /^\s*stack/i, /^\s*outils/i] },
  { key: "certifications", patterns: [/^\s*certifications?/i, /^\s*certificates?/i, /^\s*licences?\s+et\s+certifications/i] },
  { key: "languages", patterns: [/^\s*languages?/i, /^\s*langues?/i, /^\s*idiomas?/i] },
  { key: "projects", patterns: [/^\s*projects?/i, /^\s*projets?/i, /^\s*portfolio/i, /^\s*r[ée]alisations/i] },
  { key: "achievements", patterns: [/^\s*achievements?/i, /^\s*r[ée]alisations?/i, /^\s*awards?/i, /^\s*distinctions/i] },
];

const DATE_RANGE = /(\b(?:19|20)\d{2}\b|\bpresent\b|\bcurrent\b|\baujourd'hui\b|\bactuel\w*\b|\bjan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|f[ée]vr|avr|juil|d[ée]c)/i;

const SENIORITY_PATTERNS: [ParsedCV["seniority"], RegExp][] = [
  ["MANAGER", /\b(head of|director|directeur|vp|chief|manager|responsable)\b/i],
  ["LEAD", /\b(tech lead|team lead|lead developer|lead engineer|principal|staff engineer)\b/i],
  ["SENIOR", /\b(senior|sr\.?|exp[ée]riment[ée]|confirm[ée])\b/i],
  ["JUNIOR", /\b(junior|jr\.?|d[ée]butant|entry[- ]level)\b/i],
  ["INTERN", /\b(intern|stagiaire|alternance|apprentice)\b/i],
];

const LANGUAGE_DICTIONARY = [
  "french", "français", "francais", "english", "anglais", "spanish", "espagnol", "german", "allemand",
  "arabic", "arabe", "portuguese", "portugais", "italian", "italien", "dutch", "néerlandais", "chinese", "chinois",
  "japanese", "japonais", "russian", "russe", "turkish", "turc",
];

const LEVEL_WORDS = /\b(native|mother tongue|fluent|courant|advanced|avanc[ée]|professional|professionnel|intermediate|interm[ée]diaire|beginner|d[ée]butant|basic|notions?|b1|b2|c1|c2|a1|a2)\b/i;

const SKILL_DICTIONARY = [
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Python", "Django", "FastAPI", "Flask", "Java",
  "Spring Boot", "Kotlin", "Swift", "Go", "Rust", "C++", "C#", ".NET", "PHP", "Laravel", "Symfony", "Ruby",
  "Rails", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "GraphQL", "REST",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible", "CI/CD", "Git", "Linux", "HTML",
  "CSS", "Tailwind CSS", "Sass", "Vue", "Angular", "Svelte", "React Native", "Flutter", "Android", "iOS",
  "Machine Learning", "Deep Learning", "NLP", "Data Analysis", "Data Engineering", "Spark", "Airflow",
  "Tableau", "Power BI", "Excel", "Figma", "UX", "UI", "SEO", "Scrum", "Agile", "Jira", "Salesforce",
  "HubSpot", "SAP", "DevOps", "SRE", "Microservices", "Jest", "Cypress", "Playwright", "Prisma", "Stripe",
  "Firebase", "Supabase", "Webpack", "Vite",
];

function sectionText(text: string, patterns: RegExp[]): string {
  const lines = text.split("\n");
  let collecting = false;
  const collected: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isHeading = patterns.some((pattern) => pattern.test(trimmed)) && trimmed.length < 60;
    if (isHeading) {
      collecting = true;
      continue;
    }
    const isOtherHeading = SECTION_HEADINGS.some(
      (section) => section.patterns !== patterns && section.patterns.some((pattern) => pattern.test(trimmed)) && trimmed.length < 60,
    );
    if (isOtherHeading) {
      collecting = false;
      continue;
    }
    if (collecting) collected.push(trimmed);
  }
  return collected.join("\n");
}

function extractExperience(text: string): ExperienceEntry[] {
  const block = sectionText(text, SECTION_HEADINGS[0].patterns) || text;
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;

  for (const line of lines) {
    const hasDate = /\b(?:19|20)\d{2}\b/.test(line) && (line.includes("-") || line.includes("–") || line.includes("—") || /\b(?:to|à|au)\b/i.test(line));
    const isBullet = /^[•\-*·]/.test(line);

    if (hasDate && !isBullet) {
      if (current) entries.push(current);
      const dates = line.match(/\b(?:19|20)\d{2}\b/g) ?? [];
      const cleanTitle = line
        .replace(/\b(?:19|20)\d{2}\b(\s*(?:[-–—]|to|à|au)\s*(?:\b(?:19|20)\d{2}\b|present|current|aujourd'hui|actuel\w*))?/gi, "")
        .replace(/[()]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      const [titlePart, companyPart] = cleanTitle.split(/\s+[–—-]\s+|\s+at\s+|\s+chez\s+/i);
      current = {
        title: (titlePart ?? cleanTitle).trim().slice(0, 120),
        company: (companyPart ?? "").trim().slice(0, 120),
        startDate: dates[0],
        endDate: dates[1] ?? (/present|current|aujourd'hui|actuel/i.test(line) ? "Present" : undefined),
        description: "",
        highlights: [],
      };
      continue;
    }

    if (current && isBullet) {
      current.highlights?.push(line.replace(/^[•\-*·]\s*/, "").trim().slice(0, 300));
    } else if (current && line.length > 25 && !current.description) {
      current.description = line.slice(0, 600);
    }
  }
  if (current) entries.push(current);
  return entries.slice(0, 12);
}

function extractEducation(text: string): EducationEntry[] {
  const block = sectionText(text, SECTION_HEADINGS[1].patterns);
  if (!block) return [];
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: EducationEntry[] = [];
  let current: EducationEntry | null = null;

  for (const line of lines) {
    const years = line.match(/\b(?:19|20)\d{2}\b/g) ?? [];
    const isHeading = years.length > 0 || /^(master|licence|bachelor|bsc|msc|mba|phd|doctorat|dipl[oô]me|ing[ée]nieur| engineer)/i.test(line);
    if (isHeading && line.length < 140) {
      if (current) entries.push(current);
      current = {
        school: line.replace(/\b(?:19|20)\d{2}\b/g, "").replace(/[()]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 140),
        degree: /master|msc|mba|ing[ée]nieur/i.test(line)
          ? "Master"
          : /licence|bachelor|bsc/i.test(line)
            ? "Bachelor"
            : /phd|doctorat/i.test(line)
              ? "PhD"
              : undefined,
        startYear: years[0],
        endYear: years[1] ?? years[0],
      };
    } else if (current) {
      current.field = current.field ? `${current.field} ${line}`.slice(0, 140) : line.slice(0, 140);
    }
  }
  if (current) entries.push(current);
  return entries.slice(0, 8);
}

function extractSkills(text: string): string[] {
  const block = sectionText(text, SECTION_HEADINGS[2].patterns);
  const found = new Set<string>();

  for (const skill of SKILL_DICTIONARY) {
    // Word-boundary matching so "Java" is not reported when only "JavaScript" appears.
    const pattern = new RegExp(`(^|[^a-z0-9+#.])${skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}([^a-z0-9+#.]|$)`, "i");
    if (pattern.test(text)) found.add(skill);
  }

  if (block) {
    for (const token of block.split(/[,;•|\n]/)) {
      const cleaned = token.replace(/^[-*\s]+/, "").trim();
      if (cleaned.length > 1 && cleaned.length < 40 && !/[.:]{2,}/.test(cleaned)) found.add(cleaned);
    }
  }
  return Array.from(found).slice(0, 60);
}

function extractLanguages(text: string): LanguageEntry[] {
  const block = sectionText(text, SECTION_HEADINGS[4].patterns);
  const entries: LanguageEntry[] = [];
  const source = block || text;
  for (const line of source.split("\n")) {
    // Languages are often listed on one line: "French (native), English (fluent)".
    for (const chunk of line.split(/[,;|/\u2022]/)) {
      const lower = chunk.toLowerCase();
      const language = LANGUAGE_DICTIONARY.find((entry) => lower.includes(entry));
      if (!language) continue;
      const level = chunk.match(LEVEL_WORDS)?.[1];
      const canonical = language.charAt(0).toUpperCase() + language.slice(1);
      if (!entries.some((entry) => entry.name.toLowerCase() === canonical.toLowerCase())) {
        entries.push({ name: canonical, level: level ?? undefined });
      }
    }
  }
  return entries.slice(0, 10);
}

function extractCertifications(text: string): CertificationEntry[] {
  const block = sectionText(text, SECTION_HEADINGS[3].patterns);
  const entries: CertificationEntry[] = [];
  const patterns = [
    /(AWS Certified [^,\n]{2,60})/gi,
    /(Google Cloud [^,\n]{2,60})/gi,
    /(Microsoft Certified[^,\n]{0,60})/gi,
    /(Scrum Master[^,\n]{0,40})/gi,
    /(PMP[^,\n]{0,40})/gi,
    /(TOEIC[^,\n]{0,20})/gi,
    /(TOEFL[^,\n]{0,20})/gi,
    /(Certified [^,\n]{2,60})/gi,
    /(Certification [^,\n]{2,60})/gi,
  ];
  const source = block || text;
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (!value) continue;
      const year = value.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? source.match(/\b(?:19|20)\d{2}\b/)?.[0];
      const candidate = value.replace(/\s*\(\d{4}\)\s*$/, "").trim().slice(0, 120);
      const isDuplicate = entries.some(
        (entry) =>
          entry.name.toLowerCase() === candidate.toLowerCase() ||
          entry.name.toLowerCase().includes(candidate.toLowerCase()) ||
          candidate.toLowerCase().includes(entry.name.toLowerCase()),
      );
      if (!isDuplicate) entries.push({ name: candidate, issuer: undefined, year });
    }
  }
  return entries.slice(0, 12);
}

function extractProjects(text: string): ProjectEntry[] {
  const block = sectionText(text, SECTION_HEADINGS[5].patterns);
  if (!block) return [];
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: ProjectEntry[] = [];
  let current: ProjectEntry | null = null;
  for (const line of lines) {
    if (/^[•\-*·]/.test(line) || (line.length < 90 && !line.endsWith("."))) {
      if (current) entries.push(current);
      current = { name: line.replace(/^[•\-*·]\s*/, "").slice(0, 120), description: "" };
    } else if (current) {
      current.description = `${current.description ?? ""} ${line}`.trim().slice(0, 400);
      const link = line.match(/https?:\/\/\S+/)?.[0];
      if (link) current.link = link;
    }
  }
  if (current) entries.push(current);
  return entries.slice(0, 10);
}

function extractAchievements(text: string): string[] {
  const block = sectionText(text, SECTION_HEADINGS[6].patterns);
  if (!block) return [];
  return block
    .split("\n")
    .map((line) => line.replace(/^[•\-*·]\s*/, "").trim())
    .filter((line) => line.length > 8)
    .slice(0, 12);
}

function estimateYears(experience: ExperienceEntry[], text: string): number {
  const explicit = text.match(/(\d{1,2})\+?\s*(?:years|yrs|ans|ann[ée]es)/i);
  if (explicit) return Math.min(50, Number(explicit[1]));

  let months = 0;
  for (const entry of experience) {
    const start = Number(entry.startDate?.match(/\b(?:19|20)\d{2}\b/)?.[0]);
    if (!Number.isFinite(start)) continue;
    const endMatch = entry.endDate?.match(/\b(?:19|20)\d{2}\b/)?.[0];
    const end = endMatch ? Number(endMatch) : new Date().getFullYear();
    months += Math.max(0, (end - start) * 12);
  }
  if (months) return Math.min(50, Math.round(months / 12));
  return 0;
}

export function parseCvText(text: string): ParsedCV {
  const cleanText = text.replace(/\r/g, "").trim();
  const lines = cleanText.split("\n").map((line) => line.trim()).filter(Boolean);

  const email = cleanText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? null;
  const phone = cleanText.match(/(\+?\d[\d\s().-]{7,20}\d)/)?.[1]?.trim() ?? null;
  const linkedinUrl = cleanText.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[\w\-À-ÿ%]+\/?/i)?.[0] ?? null;
  const githubUrl = cleanText.match(/https?:\/\/(?:www\.)?github\.com\/[\w-]+\/?/i)?.[0] ?? null;
  const portfolioUrl =
    cleanText.match(/https?:\/\/(?!\S*linkedin|!\S*github)(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/i)?.[0] ?? null;

  const nameCandidate =
    lines
      .slice(0, 6)
      .find((line) => line.length > 3 && line.length < 60 && !/@/.test(line) && !/https?:\/\//.test(line) && /^[A-Za-zÀ-ÿ' -]+$/.test(line)) ??
    null;

  const experience = extractExperience(cleanText);
  const education = extractEducation(cleanText);
  const skills = extractSkills(cleanText);
  const languages = extractLanguages(cleanText);
  const certifications = extractCertifications(cleanText);
  const projects = extractProjects(cleanText);
  const achievements = extractAchievements(cleanText);
  const yearsExperience = estimateYears(experience, cleanText);

  const seniority =
    SENIORITY_PATTERNS.find(([, pattern]) => pattern.test(cleanText.slice(0, 2000)))?.[0] ??
    (yearsExperience >= 8 ? "SENIOR" : yearsExperience >= 3 ? "MID" : yearsExperience > 0 ? "JUNIOR" : null);

  const headline =
    lines
      .slice(0, 8)
      .find(
        (line) =>
          line.length > 5 &&
          line.length < 90 &&
          line !== nameCandidate &&
          !/@/.test(line) &&
          !/https?:\/\//.test(line) &&
          !/^\+?\d/.test(line),
      ) ?? null;

  const cityMatch = cleanText.match(/\b(?:\d{4,5}\s+)?([A-Z][a-zà-ÿ]+(?:[\s-][A-Z][a-zà-ÿ]+)*),\s*(France|Morocco|Maroc|Spain|Germany|UK|United Kingdom|USA|Canada|Netherlands|Belgium|Portugal|Switzerland|Suisse|Espagne|Allemagne)\b/);
  const city = cityMatch?.[1] ?? null;
  const country = cityMatch?.[2] ?? null;

  const summary = cleanText
    .split("\n")
    .filter((line) => line.length > 60)
    .slice(0, 2)
    .join(" ")
    .slice(0, 800);

  const suggestedTitles = Array.from(
    new Set(
      experience
        .slice(0, 4)
        .map((entry) => entry.title)
        .filter(Boolean)
        .concat(skills.length ? [`${skills[0]} ${experience[0]?.title ? "" : "Developer"}`.trim()] : []),
    ),
  ).slice(0, 6) as string[];

  return {
    fullName: nameCandidate,
    headline: headline ?? experience[0]?.title ?? null,
    email,
    phone,
    city,
    country,
    linkedinUrl,
    githubUrl,
    portfolioUrl: portfolioUrl && portfolioUrl !== linkedinUrl && portfolioUrl !== githubUrl ? portfolioUrl : null,
    yearsExperience,
    seniority,
    summary,
    skills,
    experience,
    education,
    certifications,
    languages,
    projects,
    achievements,
    suggestedTitles,
    missingSkills: [],
    recommendations: buildRecommendations({ skills, experience, education, certifications, languages, projects }),
    rawLength: cleanText.length,
  };
}

function buildRecommendations(parsed: Pick<ParsedCV, "skills" | "experience" | "education" | "certifications" | "languages" | "projects">): string[] {
  const tips: string[] = [];
  if (!parsed.experience.length) tips.push("Add dated work experience blocks — recruiters screen for them first.");
  if (parsed.experience.some((entry) => !(entry.highlights ?? []).length)) {
    tips.push("Quantify achievements in each role (impact, scale, or measurable outcomes).");
  }
  if (parsed.skills.length < 8) tips.push("List your technical stack explicitly in a dedicated skills section.");
  if (!parsed.languages.length) tips.push("Add a languages section with proficiency levels.");
  if (!parsed.certifications.length) tips.push("Certifications help pass automated filters — add any you hold.");
  if (!parsed.projects.length) tips.push("Two or three projects with links strengthen technical applications.");
  if (parsed.education.length === 0) tips.push("Include your most recent degree with years.");
  return tips.slice(0, 6);
}

/** Refines rule-based extraction with an LLM when one is configured. */
export async function analyseCvWithAI(text: string, language: "en" | "fr"): Promise<ParsedCV | null> {
  if (!aiConfigured) return null;
  try {
    const { complete } = await import("@/lib/ai/client");
    const { PROMPT, SYSTEM } = await import("@/lib/ai/prompts");
    const result = await complete<Partial<ParsedCV>>({
      system: SYSTEM.cvAnalysis,
      user: PROMPT.cvAnalysis(text, language),
      temperature: 0.1,
      maxTokens: 3000,
    });
    const base = parseCvText(text);
    const ai = result.data;
    return {
      ...base,
      fullName: ai.fullName ?? base.fullName,
      headline: ai.headline ?? base.headline,
      email: ai.email ?? base.email,
      phone: ai.phone ?? base.phone,
      city: ai.city ?? base.city,
      country: ai.country ?? base.country,
      linkedinUrl: ai.linkedinUrl ?? base.linkedinUrl,
      githubUrl: ai.githubUrl ?? base.githubUrl,
      yearsExperience: ai.yearsExperience ?? base.yearsExperience,
      seniority: ai.seniority ?? base.seniority,
      summary: ai.summary ?? base.summary,
      skills: ai.skills?.length ? ai.skills : base.skills,
      experience: ai.experience?.length ? ai.experience : base.experience,
      education: ai.education?.length ? ai.education : base.education,
      certifications: ai.certifications?.length ? ai.certifications : base.certifications,
      languages: ai.languages?.length ? ai.languages : base.languages,
      projects: ai.projects?.length ? ai.projects : base.projects,
      achievements: ai.achievements?.length ? ai.achievements : base.achievements,
      suggestedTitles: ai.suggestedTitles?.length ? ai.suggestedTitles : base.suggestedTitles,
      missingSkills: ai.missingSkills ?? [],
      recommendations: ai.recommendations?.length ? ai.recommendations : base.recommendations,
    };
  } catch (error) {
    console.warn("[cv] AI structuring unavailable, keeping rule-based extraction:", error);
    return null;
  }
}
