import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { automationRules } from "@/lib/db/schema";

export type RuleKey =
  | "auto_prepare"
  | "min_match_score"
  | "max_listing_age_days"
  | "never_duplicate"
  | "daily_send_limit"
  | "send_window"
  | "follow_up_after_days"
  | "pause_on_rate_limit"
  | "require_approval"
  | "max_per_company";

export type RuleDefinition = {
  key: RuleKey;
  label: string;
  description: string;
  kind: "boolean" | "number" | "window";
  defaultEnabled: boolean;
  defaultConfig: Record<string, number | string | boolean>;
  unit?: string;
  min?: number;
  max?: number;
};

/** Every automation rule is editable from Settings → Automation rules. */
export const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    key: "auto_prepare",
    label: "Auto-prepare high-scoring jobs",
    description: "When a newly discovered job scores above the threshold, research the company and prepare a personalized application automatically.",
    kind: "boolean",
    defaultEnabled: true,
    defaultConfig: { enabled: true },
  },
  {
    key: "min_match_score",
    label: "Minimum compatibility score",
    description: "Jobs below this compatibility score are never prepared or sent.",
    kind: "number",
    defaultEnabled: true,
    defaultConfig: { value: 85 },
    unit: "%",
    min: 0,
    max: 100,
  },
  {
    key: "max_listing_age_days",
    label: "Maximum listing age",
    description: "Only prepare applications for jobs posted within this many days.",
    kind: "number",
    defaultEnabled: true,
    defaultConfig: { value: 7 },
    unit: "days",
    min: 1,
    max: 90,
  },
  {
    key: "never_duplicate",
    label: "Never apply to the same vacancy twice",
    description: "Blocked at three levels: duplicate listings, duplicate applications and duplicate sends (idempotency keys).",
    kind: "boolean",
    defaultEnabled: true,
    defaultConfig: { enabled: true },
  },
  {
    key: "daily_send_limit",
    label: "Daily sending limit",
    description: "Maximum number of approved emails sent per day across all connected mailboxes.",
    kind: "number",
    defaultEnabled: true,
    defaultConfig: { value: 10 },
    unit: "emails/day",
    min: 1,
    max: 200,
  },
  {
    key: "send_window",
    label: "Sending window",
    description: "Approved emails are only delivered inside this window (recipient timezone when known).",
    kind: "window",
    defaultEnabled: true,
    defaultConfig: { startHour: 9, endHour: 11 },
    min: 0,
    max: 23,
  },
  {
    key: "follow_up_after_days",
    label: "Follow-up delay",
    description: "Create a follow-up draft this many business days after sending, if no reply arrives.",
    kind: "number",
    defaultEnabled: true,
    defaultConfig: { value: 7 },
    unit: "business days",
    min: 1,
    max: 30,
  },
  {
    key: "pause_on_rate_limit",
    label: "Pause on provider rate limit",
    description: "Immediately pause the automation when the email provider reports rate limiting, then resume automatically.",
    kind: "boolean",
    defaultEnabled: true,
    defaultConfig: { enabled: true },
  },
  {
    key: "require_approval",
    label: "Require human approval",
    description: "Nothing is ever sent without an explicit approval in the review queue.",
    kind: "boolean",
    defaultEnabled: true,
    defaultConfig: { enabled: true },
  },
  {
    key: "max_per_company",
    label: "Maximum applications per company",
    description: "Caps how many applications are prepared for a single company in a rolling 30-day window.",
    kind: "number",
    defaultEnabled: true,
    defaultConfig: { value: 3 },
    unit: "per 30 days",
    min: 1,
    max: 20,
  },
];

export type ResolvedRules = Record<RuleKey, { enabled: boolean; config: Record<string, number | string | boolean> }>;

/** Merges built-in defaults with the user's saved overrides. */
export async function getRules(userId: string): Promise<ResolvedRules> {
  const rows = await getDb().select().from(automationRules).where(eq(automationRules.userId, userId));
  const overrides = new Map(rows.map((row) => [row.key, row]));

  const resolved = {} as ResolvedRules;
  for (const definition of RULE_DEFINITIONS) {
    const override = overrides.get(definition.key);
    resolved[definition.key] = {
      enabled: override ? override.enabled : definition.defaultEnabled,
      config: { ...definition.defaultConfig, ...((override?.config as Record<string, number | string | boolean>) ?? {}) },
    };
  }
  return resolved;
}

export function numberRule(rules: ResolvedRules, key: RuleKey, field = "value", fallback = 0): number {
  const raw = rules[key]?.config?.[field];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function booleanRule(rules: ResolvedRules, key: RuleKey, field = "enabled", fallback = false): boolean {
  const raw = rules[key]?.config?.[field];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw === "true";
  return fallback;
}

export function isRuleActive(rules: ResolvedRules, key: RuleKey): boolean {
  return rules[key]?.enabled ?? false;
}

export async function upsertRule(userId: string, input: {
  key: string;
  label?: string;
  description?: string;
  enabled: boolean;
  config: Record<string, number | string | boolean>;
}) {
  const definition = RULE_DEFINITIONS.find((r) => r.key === input.key);
  const [row] = await getDb()
    .insert(automationRules)
    .values({
      userId,
      key: input.key,
      label: input.label ?? definition?.label ?? input.key,
      description: input.description ?? definition?.description ?? "",
      enabled: input.enabled,
      config: input.config,
    })
    .onConflictDoUpdate({
      target: [automationRules.userId, automationRules.key],
      set: { enabled: input.enabled, config: input.config, label: input.label ?? definition?.label ?? input.key, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function resetRules(userId: string) {
  await getDb().delete(automationRules).where(eq(automationRules.userId, userId));
  return getRules(userId);
}

/** Business-day aware due date for the follow-up rule. */
export function followUpDueDate(from: Date, businessDays: number): Date {
  const result = new Date(from);
  let remaining = Math.max(1, businessDays);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

/** True when `hour` falls inside the configured sending window. */
export function withinSendWindow(rules: ResolvedRules, date: Date, timezone?: string | null): boolean {
  if (!isRuleActive(rules, "send_window")) return true;
  const start = numberRule(rules, "send_window", "startHour", 9);
  const end = numberRule(rules, "send_window", "endHour", 11);
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: timezone || "UTC" }).format(date),
    );
  } catch {
    hour = date.getUTCHours();
  }
  return hour >= start && hour < end;
}

/** Next timestamp at which the sending window opens (used by the scheduler). */
export function nextWindowStart(rules: ResolvedRules, from: Date, timezone?: string | null): Date {
  const start = numberRule(rules, "send_window", "startHour", 9);
  const candidate = new Date(from);
  candidate.setMinutes(0, 0, 0);
  for (let i = 0; i < 48; i += 1) {
    candidate.setHours(candidate.getHours() + (i === 0 ? 1 : 0));
    if (withinSendWindow(rules, candidate, timezone)) return candidate;
    candidate.setHours(candidate.getHours() + 1);
  }
  const fallback = new Date(from);
  fallback.setHours(start, 0, 0, 0);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}
