import { getDb } from "@/lib/db";
import { automationRules, automationSchedules } from "@/lib/db/schema";
import { RULE_DEFINITIONS } from "@/lib/services/rules";

/** Seeds default automation rules + a (disabled) schedule for a new account. */
export async function seedDefaultsForUser(userId: string) {
  const db = getDb();

  await db
    .insert(automationRules)
    .values(
      RULE_DEFINITIONS.map((definition) => ({
        userId,
        key: definition.key,
        label: definition.label,
        description: definition.description,
        enabled: definition.defaultEnabled,
        config: definition.defaultConfig,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(automationSchedules)
    .values({ userId, enabled: false, timezone: "UTC" })
    .onConflictDoNothing();

  return { ok: true };
}
