import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { safeFileName, sanitiseForPdf, textToDocx, textToMarkdown, textToPdf } from "@/lib/documents/export";

async function font() {
  const pdf = await PDFDocument.create();
  return pdf.embedFont(StandardFonts.Helvetica);
}

describe("sanitiseForPdf", () => {
  it("drops characters a WinAnsi font cannot encode", async () => {
    const f = await font();
    expect(sanitiseForPdf("Hello ✅ world", f as never)).toBe("Hello  world");
  });

  it("folds exotic spaces and smart punctuation to ASCII", async () => {
    const f = await font();
    expect(sanitiseForPdf("a b", f as never)).toBe("a b");
    expect(sanitiseForPdf("it’s fine", f as never)).toBe("it's fine");
    expect(sanitiseForPdf("wait…", f as never)).toBe("wait...");
  });

  it("keeps newlines (callers split on them before measuring)", async () => {
    const f = await font();
    expect(sanitiseForPdf("line one\nline two", f as never)).toBe("line one\nline two");
  });

  it("strips carriage returns so they can never reach the text measurer", async () => {
    const f = await font();
    expect(sanitiseForPdf("a\r\nb", f as never)).toBe("a\nb");
  });
});

describe("textToPdf", () => {
  it("produces a parseable single-page PDF", async () => {
    const buffer = await textToPdf({
      title: "Cover letter — Vela Studio",
      body: "Dear team,\n\nI would love to join Vela Studio as a Frontend Engineer.\n\nBest regards,\nAmine",
      author: "Amine Berrada",
    });

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");

    const reparsed = await PDFDocument.load(buffer);
    expect(reparsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("never throws on emoji, RTL text or a very long unbroken token", async () => {
    const buffer = await textToPdf({
      title: "🚀 Letter",
      body: "مرحبا\n\nhttps:// example .com/ ".repeat(2) + "x".repeat(400),
    });
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("paginates very long letters", async () => {
    const buffer = await textToPdf({
      title: "Long letter",
      body: Array.from({ length: 200 }, (_, index) => `Paragraph ${index} with enough words to fill several lines of an A4 page.`).join("\n\n"),
    });
    const reparsed = await PDFDocument.load(buffer);
    expect(reparsed.getPageCount()).toBeGreaterThan(1);
  });
});

describe("textToDocx", () => {
  it("produces a zip-based docx payload", async () => {
    const buffer = await textToDocx({ title: "Cover letter", body: "Hello there.", author: "Amine" });
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

describe("textToMarkdown", () => {
  it("renders the title as H1 and keeps paragraphs", () => {
    const markdown = textToMarkdown({ title: "Cover letter", body: "First block.\n\nSecond block.", author: "Amine" });
    expect(markdown.startsWith("# Cover letter")).toBe(true);
    expect(markdown).toContain("_Amine_");
    expect(markdown).toContain("Second block.");
  });
});

describe("safeFileName", () => {
  it("slugifies and strips accents", () => {
    expect(safeFileName("Lettre de motivation — Véla Studio!", "pdf")).toBe("lettre-de-motivation-vela-studio.pdf");
  });

  it("truncates very long titles", () => {
    expect(safeFileName("a".repeat(200), "docx").length).toBeLessThanOrEqual(90);
  });
});
