import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { upsertManyCompanies } from "@/lib/services/companies";
import { bulkCompanySchema } from "@/lib/validation";
import { recordActivity } from "@/lib/audit";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const { companies } = bulkCompanySchema.parse(await req.json());
    const created = await upsertManyCompanies(user.id, companies);

    await recordActivity({
      userId: user.id,
      agent: "RESEARCH",
      message: `${created.length} target compan${created.length === 1 ? "y" : "ies"} imported`,
      type: "SUCCESS",
    });

    return ok({ created, skipped: companies.length - created.length }, 201);
  } catch (error) {
    return fail(error);
  }
}
