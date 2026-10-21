import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getRules, resetRules, upsertRule } from "@/lib/services/rules";
import { ruleUpdateSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/audit";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    return ok({ rules: await getRules(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const input = ruleUpdateSchema.parse(await req.json());
    const rule = await upsertRule(user.id, input);
    await recordActivity({
      userId: user.id,
      agent: "AUTOMATION",
      message: `Rule updated — ${rule.label}: ${input.enabled ? "enabled" : "disabled"}`,
      type: "INFO",
    });
    return ok({ rule, rules: await getRules(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE() {
  try {
    await dbReady();
    const user = await requireUser();
    const rules = await resetRules(user.id);
    await recordActivity({ userId: user.id, agent: "AUTOMATION", message: "Automation rules reset to defaults", type: "WARNING" });
    return ok({ rules });
  } catch (error) {
    return fail(error);
  }
}
