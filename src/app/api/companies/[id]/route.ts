import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getCompany, listContacts } from "@/lib/services/companies";
import { companyUpdateSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { companies } from "@/lib/db/schema";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const company = await getCompany(user.id, id);
    if (!company) return fail(new (await import("@/lib/api")).ApiError("Company not found", 404));
    const contacts = await listContacts(user.id, id);
    return ok({ company, contacts });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const patch = companyUpdateSchema.parse(await req.json());
    const [company] = await getDb()
      .update(companies)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(companies.id, id), eq(companies.userId, user.id)))
      .returning();
    if (!company) return fail(new (await import("@/lib/api")).ApiError("Company not found", 404));
    return ok({ company });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    await getDb().delete(companies).where(and(eq(companies.id, id), eq(companies.userId, user.id)));
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
