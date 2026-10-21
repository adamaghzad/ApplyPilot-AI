import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { parseCvText } from "@/lib/cv/parse";
import { extractPdfText } from "@/lib/cv/parse";

/** Builds a real, Flate-compressed PDF so the extractor is tested end to end. */
async function buildCvPdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 11, font });
    y -= 18;
  }
  return Buffer.from(await pdf.save());
}

const CV_LINES = [
  "Amine Berrada",
  "Senior Frontend Engineer — Casablanca, Morocco",
  "amine.berrada@example.com · +212 6 12 34 56 78",
  "",
  "EXPERIENCE",
  "Senior Frontend Engineer — Maroc Telecom Digital (2021 - Present)",
  "- Led migration of a 200-page React app to Next.js with TypeScript",
  "- Reduced Time to Interactive by 42% through code splitting",
  "Frontend Engineer — Inwi Labs (2018 - 2021)",
  "- Delivered customer dashboards used by 120k monthly users",
  "",
  "SKILLS",
  "TypeScript, JavaScript, React, Next.js, Node.js, PostgreSQL, GraphQL, Docker, AWS",
  "",
  "EDUCATION",
  "BSc Computer Science — Université Hassan II (2015 - 2018)",
  "",
  "LANGUAGES",
  "French (native), English (fluent), Arabic (native), Spanish (intermediate)",
  "",
  "CERTIFICATIONS",
  "AWS Certified Developer Associate (2022)",
  "AWS Certified Developer Associate (2022)",
];

describe("extractPdfText", () => {
  it("extracts readable text from a Flate-compressed PDF", async () => {
    const buffer = await buildCvPdf(CV_LINES);
    const text = await extractPdfText(buffer);

    expect(text).toContain("Amine Berrada");
    expect(text).toContain("Senior Frontend Engineer");
    expect(text).toContain("TypeScript");
    expect(text.length).toBeGreaterThan(300);
  });

  it("returns an empty string for a non-PDF buffer instead of throwing", async () => {
    await expect(extractPdfText(Buffer.from("this is definitely not a pdf"))).resolves.toBe("");
  });
});

describe("parseCvText", () => {
  const parsed = parseCvText(CV_LINES.join("\n"));

  it("extracts identity and contact details", () => {
    expect(parsed.fullName).toBe("Amine Berrada");
    expect(parsed.email).toBe("amine.berrada@example.com");
    expect(parsed.phone).toContain("212");
    expect(parsed.city).toBe("Casablanca");
  });

  it("detects skills without substring false positives", () => {
    expect(parsed.skills).toContain("JavaScript");
    expect(parsed.skills).toContain("TypeScript");
    expect(parsed.skills).toContain("React");
    // "JavaScript" must not produce a bare "Java" match.
    expect(parsed.skills).not.toContain("Java");
    // "Next.js" must not surface as "Next".
    expect(parsed.skills).not.toContain("Next");
  });

  it("parses experience entries with dates", () => {
    expect(parsed.experience.length).toBeGreaterThanOrEqual(2);
    const [first] = parsed.experience;
    expect(first.company).toContain("Maroc Telecom");
    expect(first.title).toContain("Senior Frontend Engineer");
    expect(parsed.yearsExperience).toBeGreaterThanOrEqual(5);
  });

  it("parses languages split on commas with their levels", () => {
    expect(parsed.languages.length).toBeGreaterThanOrEqual(3);
    const french = parsed.languages.find((language) => language.name?.includes("French"));
    expect(french).toBeTruthy();
    expect(french?.level).toBeTruthy();
  });

  it("de-duplicates certifications", () => {
    const aws = parsed.certifications.filter((cert) => cert.name?.includes("AWS"));
    expect(aws).toHaveLength(1);
  });

  it("never returns a negative or absurd years-of-experience value", () => {
    expect(parsed.yearsExperience ?? 0).toBeGreaterThanOrEqual(0);
    expect(parsed.yearsExperience ?? 0).toBeLessThanOrEqual(60);
  });

  it("returns a stable shape for empty input", () => {
    const empty = parseCvText("");
    expect(empty.skills).toEqual([]);
    expect(empty.experience).toEqual([]);
    expect(empty.fullName).toBeNull();
  });
});
