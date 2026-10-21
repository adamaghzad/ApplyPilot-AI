import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getCvFile } from "@/lib/services/cv";
import { fail } from "@/lib/api";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const { document, buffer } = await getCvFile(user.id, id);
    const preview = new URL(req.url).searchParams.get("preview") === "1";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": document.mimeType,
        "content-disposition": `${preview ? "inline" : "attachment"}; filename="${document.fileName}"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
