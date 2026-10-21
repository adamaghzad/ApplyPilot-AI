import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { createCompany, listCompanies, upsertManyCompanies } from "@/lib/services/companies";
import { bulkCompanySchema, companySchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const companies = await listCompanies(user.id);
    return ok({ companies });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const body = await req.json();
    const input = companySchema.parse(body);
    const company = await createCompany(user.id, input);
    if (!company) return fail(new (await import("@/lib/api")).ApiError("That company already exists in your list", 409));
    return ok({ company }, 201);
  } catch (error) {
    return fail(error);
  }
}
