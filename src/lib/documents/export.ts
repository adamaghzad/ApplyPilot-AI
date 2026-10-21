import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/**
 * pdf-lib's standard fonts are WinAnsi-encoded: emoji, narrow no-break spaces and
 * other out-of-range code points make `widthOfTextAtSize`/`drawText` throw and
 * would 500 the export route. Typographic characters that *are* representable are
 * kept; anything else is folded to a sensible ASCII fallback or dropped.
 */
const TRANSLITERATE: Record<string, string> = {
  "\u00a0": " ",
  "\u202f": " ",
  "\u2009": " ",
  "\u2007": " ",
  "\u200b": "",
  "\u200c": "",
  "\u200d": "",
  "\ufeff": "",
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u201e": '"',
  "\u2032": "'",
  "\u2033": '"',
  "\u2026": "...",
  "\u00ad": "",
  "\u0009": "    ",
};

const encodable = new WeakMap<PDFFont, Map<string, boolean>>();

function isEncodable(font: PDFFont, char: string): boolean {
  let cache = encodable.get(font);
  if (!cache) {
    cache = new Map();
    encodable.set(font, cache);
  }
  const cached = cache.get(char);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    font.encodeText(char);
  } catch {
    ok = false;
  }
  cache.set(char, ok);
  return ok;
}

/** Makes arbitrary user/model text safe to measure and draw with a WinAnsi font. */
export function sanitiseForPdf(text: string, font: PDFFont): string {
  if (!text) return "";
  let out = "";
  for (const char of text) {
    const mapped = TRANSLITERATE[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    if (char === "\n") {
      out += char;
      continue;
    }
    if (char === "\r") continue;
    out += isEncodable(font, char) ? char : "";
  }
  return out;
}

/** Renders a cover letter as a clean, printable PDF (pure JS, no native deps). */
export async function textToPdf(input: { title: string; body: string; author?: string | null }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;
  const fontSize = 11;
  const lineHeight = fontSize * 1.5;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const writeLine = (rawText: string, options: { bold?: boolean; size?: number; gap?: number } = {}) => {
    const size = options.size ?? fontSize;
    const activeFont = options.bold ? bold : font;
    const text = sanitiseForPdf(rawText, activeFont);

    // Single newlines are meaningful (addresses, bullet stacks) — render each
    // segment as its own wrapped block instead of measuring them in one go.
    for (const paragraph of text.split("\n")) {
      if (!paragraph.trim()) {
        y -= lineHeight * (options.gap ?? 1);
        continue;
      }

      const words = paragraph
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((word) => hardWrap(word, activeFont, size, maxWidth));

      let line = "";
      const lines: string[] = [];
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (activeFont.widthOfTextAtSize(candidate, size) > maxWidth) {
          if (line) lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);

      for (const rendered of lines) {
        if (y < margin + lineHeight) {
          page = pdf.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(rendered, { x: margin, y, size, font: activeFont, color: rgb(0.08, 0.09, 0.12) });
        y -= lineHeight * (options.gap ?? 1);
      }
    }
  };

  writeLine(input.title, { bold: true, size: 16, gap: 1.6 });
  if (input.author) {
    writeLine(input.author, { size: 10, gap: 1.6 });
  }

  y -= lineHeight;

  for (const paragraph of input.body.split(/\n{2,}/)) {
    const text = paragraph.replace(/^•\s*/gm, "• ").trim();
    if (!text) continue;
    writeLine(text);
    y -= lineHeight * 0.5;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/** Splits a token that is wider than the text column (long URLs, identifiers). */
function hardWrap(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!word) return [];
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];

  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = current + char;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Renders a cover letter as an editable .docx file. */
export async function textToDocx(input: { title: string; body: string; author?: string | null }): Promise<Buffer> {
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: input.title, heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
  ];

  if (input.author) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: input.author, italics: true, size: 22 })], spacing: { after: 300 } }));
  }

  for (const block of input.body.split(/\n{2,}/)) {
    const text = block.trim();
    if (!text) continue;
    const isBullet = text.startsWith("•");
    if (isBullet) {
      for (const line of text.split("\n")) {
        paragraphs.push(new Paragraph({ text: line.replace(/^•\s*/, ""), bullet: { level: 0 }, spacing: { after: 80 } }));
      }
    } else {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { after: 200 } }));
    }
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Renders a cover letter as Markdown (plain, portable, diff-friendly). */
export function textToMarkdown(input: { title: string; body: string; author?: string | null }): string {
  const header = [`# ${input.title}`, ""];
  if (input.author) header.push(`_${input.author}_`, "");

  const blocks = input.body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => (/^[\-\*•]/.test(block) ? block : block.replace(/\n/g, "  \n")));

  return [...header, ...blocks, ""].join("\n");
}

export function safeFileName(value: string, extension: string) {
  return `${value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}.${extension}`;
}
