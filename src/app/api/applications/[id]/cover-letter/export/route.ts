import { and, desc, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { candidateProfiles, coverLetters } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { safeFileName, textToDocx, textToPdf } from "@/lib/documents/export";
import { ApiError, fail } from "@/lib/api";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const format = new URL(req.url).searchParams.get("format") ?? "pdf";

    const db = getDb();
    const [letter] = await db
      .select()
      .from(coverLetters)
      .where(and(eq(coverLetters.applicationId, id), eq(coverLetters.userId, user.id)))
      .orderBy(desc(coverLetters.createdAt))
      .limit(1);
    if (!letter) throw new ApiError("No cover letter found", 404);

    const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
    const body = letter.plainText || letter.content;

    if (format === "docx") {
      const buffer = await textToDocx({ title: letter.title, body, author: profile?.fullName ?? null });
      return new Response(new Uint8Array(buffer), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": `attachment; filename="${safeFileName(letter.title, "docx")}"`,
        },
      });
    }

    if (format === "txt") {
      return new Response(body, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="${safeFileName(letter.title, "txt")}"`,
        },
      });
    }

    const buffer = await textToPdf({ title: letter.title, body, author: profile?.fullName ?? null });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeFileName(letter.title, "pdf")}"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
