import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

  const writeLine = (text: string, options: { bold?: boolean; size?: number; gap?: number } = {}) => {
    const size = options.size ?? fontSize;
    const activeFont = options.bold ? bold : font;
    const words = text.split(" ");
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

export function safeFileName(value: string, extension: string) {
  return `${value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}.${extension}`;
}
