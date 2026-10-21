import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { ingestCv, listCvDocuments } from "@/lib/services/cv";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const documents = await listCvDocuments(user.id);
    return ok({ documents });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return fail(new (await import("@/lib/api")).ApiError("No file uploaded", 400));
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { document, parsed } = await ingestCv(user.id, {
      name: file.name,
      type: file.type,
      size: file.size,
      buffer,
    });

    return ok({ document, parsed }, 201);
  } catch (error) {
    return fail(error);
  }
}
