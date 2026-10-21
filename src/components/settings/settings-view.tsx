"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Mail,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { WORK_MODES } from "@/lib/enums";
import { cn } from "@/lib/utils";

type Profile = {
  fullName: string | null;
  headline: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
  summary: string | null;
  desiredTitles: string[] | null;
  desiredLocations: string[] | null;
  workModes: string[] | null;
  preferredLanguage: string | null;
  currency: string | null;
  minSalary: number | null;
  availabilityWeeks: number | null;
  timezone: string | null;
  automationMode: string | null;
  autoApplyEnabled: boolean | null;
  dailyApplicationLimit: number | null;
  completeness: number | null;
};

type Rule = { key: string; label: string; description: string; enabled: boolean; config: Record<string, number | string | boolean> };
type Schedule = {
  enabled: boolean;
  mode: string;
  timezone: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxPerRun: number;
};
type Connection = {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
  status: string;
  dailyLimit: number;
  sentToday: number;
  lastError: string | null;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SettingsView() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <SettingsIcon className="h-5 w-5 text-primary" /> Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile, targeting, automation rules, integrations and the model backend.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile">
            <User className="h-3.5 w-3.5" /> Profile
          </TabsTrigger>
          <TabsTrigger value="automation">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Automation
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Mail className="h-3.5 w-3.5" /> Integrations
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Bot className="h-3.5 w-3.5" /> AI model
          </TabsTrigger>
          <TabsTrigger value="data">
            <ShieldAlert className="h-3.5 w-3.5" /> Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="automation" className="space-y-4">
          <AutomationTab />
        </TabsContent>
        <TabsContent value="integrations" className="space-y-4">
          <IntegrationsTab />
        </TabsContent>
        <TabsContent value="ai" className="space-y-4">
          <AiTab />
        </TabsContent>
        <TabsContent value="data" className="space-y-4">
          <DataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ProfileTab() {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<{ user: { email: string; name: string; timezone: string | null }; profile: Profile | null }>("/api/profile"),
  });

  const data = profile.data?.profile;
  const [form, setForm] = React.useState<Partial<Profile>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const value = (key: keyof Profile) => (form[key] ?? "") as string | number | string[];

  async function saveBasics() {
    setSaving(true);
    try {
      await api.patch("/api/profile", {
        fullName: String(value("fullName") || "").trim(),
        headline: String(value("headline") || "").trim() || null,
        phone: String(value("phone") || "").trim() || null,
        city: String(value("city") || "").trim() || null,
        country: String(value("country") || "").trim() || null,
        linkedinUrl: String(value("linkedinUrl") || "").trim() || null,
        githubUrl: String(value("githubUrl") || "").trim() || null,
        portfolioUrl: String(value("portfolioUrl") || "").trim() || null,
        summary: String(value("summary") || "").trim() || null,
      });
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the profile");
    } finally {
      setSaving(false);
    }
  }

  async function savePreferences() {
    setSaving(true);
    try {
      await api.put("/api/profile/preferences", {
        desiredTitles: (form.desiredTitles ?? []).filter(Boolean),
        desiredLocations: (form.desiredLocations ?? []).filter(Boolean),
        workModes: (form.workModes?.length ? form.workModes : ["REMOTE", "HYBRID"]) as typeof WORK_MODES[number][],
        preferredLanguage: (form.preferredLanguage ?? "en") as "en" | "fr",
        currency: form.currency ?? "EUR",
        minSalary: form.minSalary ?? null,
        availabilityWeeks: form.availabilityWeeks ?? 0,
        timezone: form.timezone ?? "UTC",
      });
      toast.success("Preferences saved — scores will be recalculated");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save preferences");
    } finally {
      setSaving(false);
    }
  }

  if (profile.isLoading) {
    return <SkeletonCard />;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Candidate profile</CardTitle>
          <CardDescription>Used in every generated email and cover letter, exactly as written here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={String(value("fullName"))} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
          </Field>
          <Field label="Headline">
            <Input value={String(value("headline"))} onChange={(event) => setForm({ ...form, headline: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={String(value("phone"))} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="City">
            <Input value={String(value("city"))} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </Field>
          <Field label="Country">
            <Input value={String(value("country"))} onChange={(event) => setForm({ ...form, country: event.target.value })} />
          </Field>
          <Field label="LinkedIn">
            <Input value={String(value("linkedinUrl"))} onChange={(event) => setForm({ ...form, linkedinUrl: event.target.value })} />
          </Field>
          <Field label="GitHub">
            <Input value={String(value("githubUrl"))} onChange={(event) => setForm({ ...form, githubUrl: event.target.value })} />
          </Field>
          <Field label="Portfolio">
            <Input value={String(value("portfolioUrl"))} onChange={(event) => setForm({ ...form, portfolioUrl: event.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Summary">
              <Textarea
                value={String(value("summary"))}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                className="min-h-[100px]"
              />
            </Field>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button size="sm" disabled={saving} onClick={() => void saveBasics()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Job targeting</CardTitle>
          <CardDescription>Drives discovery and the compatibility score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Desired titles (one per line)">
            <Textarea
              value={(form.desiredTitles ?? []).join("\n")}
              onChange={(event) => setForm({ ...form, desiredTitles: event.target.value.split("\n") })}
              className="min-h-[90px]"
            />
          </Field>
          <Field label="Desired locations (one per line)">
            <Textarea
              value={(form.desiredLocations ?? []).join("\n")}
              onChange={(event) => setForm({ ...form, desiredLocations: event.target.value.split("\n") })}
              className="min-h-[80px]"
            />
          </Field>

          <Field label="Work modes">
            <div className="flex flex-wrap gap-1.5">
              {WORK_MODES.map((mode) => {
                const active = (form.workModes ?? []).includes(mode);
                return (
                  <Button
                    key={mode}
                    size="xs"
                    variant={active ? "secondary" : "ghost"}
                    onClick={() =>
                      setForm({
                        ...form,
                        workModes: active
                          ? (form.workModes ?? []).filter((item) => item !== mode)
                          : [...(form.workModes ?? []), mode],
                      })
                    }
                  >
                    {mode.toLowerCase()}
                  </Button>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Language">
              <select
                value={form.preferredLanguage ?? "en"}
                onChange={(event) => setForm({ ...form, preferredLanguage: event.target.value })}
                className="h-10 rounded-lg border border-input bg-background/70 px-3 text-sm"
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </Field>
            <Field label="Minimum salary">
              <Input
                type="number"
                value={form.minSalary ?? ""}
                onChange={(event) => setForm({ ...form, minSalary: event.target.value ? Number(event.target.value) : null })}
              />
            </Field>
            <Field label="Availability (weeks)">
              <Input
                type="number"
                value={form.availabilityWeeks ?? 0}
                onChange={(event) => setForm({ ...form, availabilityWeeks: Number(event.target.value) })}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button size="sm" disabled={saving} onClick={() => void savePreferences()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AutomationTab() {
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => api.get<{ rules: Record<string, Rule> }>("/api/automation/rules") });
  const scheduleQuery = useQuery({
    queryKey: ["schedule"],
    queryFn: () => api.get<{ schedule: Schedule | null }>("/api/automation/schedule"),
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<{ profile: Profile | null }>("/api/profile"),
  });

  const [mode, setMode] = React.useState("ASSISTED");
  const [limit, setLimit] = React.useState(10);
  const [schedule, setSchedule] = React.useState<Schedule | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);

  React.useEffect(() => {
    const p = profile.data?.profile;
    if (p) {
      setMode(p.automationMode ?? "ASSISTED");
      setLimit(p.dailyApplicationLimit ?? 10);
    }
  }, [profile.data]);

  React.useEffect(() => {
    if (scheduleQuery.data?.schedule) setSchedule(scheduleQuery.data.schedule);
  }, [scheduleQuery.data]);

  async function toggleRule(rule: Rule, enabled: boolean) {
    setSaving(rule.key);
    try {
      await api.put("/api/automation/rules", { ...rule, enabled });
      toast.success(`${rule.label} ${enabled ? "enabled" : "disabled"}`);
      void queryClient.invalidateQueries({ queryKey: ["rules"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the rule");
    } finally {
      setSaving(null);
    }
  }

  async function updateRuleConfig(rule: Rule, config: Record<string, number | string | boolean>) {
    setSaving(rule.key);
    try {
      await api.put("/api/automation/rules", { ...rule, config });
      toast.success(`${rule.label} updated`);
      void queryClient.invalidateQueries({ queryKey: ["rules"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the rule");
    } finally {
      setSaving(null);
    }
  }

  async function saveMode() {
    setSaving("mode");
    try {
      await api.put("/api/profile/automation", {
        automationMode: mode,
        autoApplyEnabled: mode === "SCHEDULED",
        dailyApplicationLimit: limit,
      });
      toast.success("Automation mode saved");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the automation mode");
    } finally {
      setSaving(null);
    }
  }

  async function saveSchedule() {
    if (!schedule) return;
    setSaving("schedule");
    try {
      await api.put("/api/automation/schedule", schedule);
      toast.success("Schedule saved");
      void queryClient.invalidateQueries({ queryKey: ["schedule"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the schedule");
    } finally {
      setSaving(null);
    }
  }

  const ruleList = Object.values(rules.data?.rules ?? {});

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Automation mode</CardTitle>
          <CardDescription>
            Manual prepares drafts only. Assisted queues them for your approval. Scheduled sends approved applications
            inside the window below — never more than the daily cap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {["MANUAL", "ASSISTED", "SCHEDULED"].map((option) => (
              <Button key={option} size="sm" variant={mode === option ? "secondary" : "ghost"} onClick={() => setMode(option)}>
                {option.toLowerCase()}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Daily application limit">
              <Input
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(event) => setLimit(Math.max(1, Number(event.target.value)))}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button size="sm" disabled={saving === "mode"} onClick={() => void saveMode()}>
              {saving === "mode" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save mode
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Sending window</CardTitle>
          <CardDescription>Approved applications are only delivered inside this window, in your timezone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!schedule ? (
            <p className="text-xs italic text-muted-foreground">No schedule yet — configure one below.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Enable scheduled sending</p>
                  <p className="text-[11px] text-muted-foreground">Requires an approved application and a connected mailbox.</p>
                </div>
                <Switch checked={schedule.enabled} onCheckedChange={(checked) => setSchedule({ ...schedule, enabled: checked })} />
              </div>

              <Field label="Days">
                <div className="flex flex-wrap gap-1">
                  {DAY_LABELS.map((label, index) => {
                    const active = schedule.daysOfWeek.includes(index);
                    return (
                      <Button
                        key={label}
                        size="xs"
                        variant={active ? "secondary" : "ghost"}
                        onClick={() =>
                          setSchedule({
                            ...schedule,
                            daysOfWeek: active
                              ? schedule.daysOfWeek.filter((day) => day !== index)
                              : [...schedule.daysOfWeek, index].sort(),
                          })
                        }
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Start hour">
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={schedule.startHour}
                    onChange={(event) => setSchedule({ ...schedule, startHour: Number(event.target.value) })}
                  />
                </Field>
                <Field label="End hour">
                  <Input
                    type="number"
                    min={1}
                    max={23}
                    value={schedule.endHour}
                    onChange={(event) => setSchedule({ ...schedule, endHour: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Max per run">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={schedule.maxPerRun}
                    onChange={(event) => setSchedule({ ...schedule, maxPerRun: Number(event.target.value) })}
                  />
                </Field>
              </div>

              <div className="flex justify-end">
                <Button size="sm" disabled={saving === "schedule"} onClick={() => void saveSchedule()}>
                  {saving === "schedule" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save schedule
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Automation rules</CardTitle>
          <CardDescription>These guards run before anything is drafted, queued or sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ruleList.length === 0 && <p className="text-xs italic text-muted-foreground">No rules loaded.</p>}
          {ruleList.map((rule) => (
            <div key={rule.key} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">{rule.label}</p>
                  {saving === rule.key && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
                {rule.description && <p className="mt-0.5 text-[11px] text-muted-foreground">{rule.description}</p>}

                {Object.entries(rule.config)
                  .filter(([, entry]) => typeof entry === "number")
                  .map(([key, entry]) => (
                    <div key={key} className="mt-2 flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground">{key.replace(/_/g, " ")}</Label>
                      <Input
                        type="number"
                        className="h-7 w-24 text-xs"
                        value={Number(entry)}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isNaN(next)) void updateRuleConfig(rule, { ...rule.config, [key]: next });
                        }}
                        onBlur={(event) => void updateRuleConfig(rule, { ...rule.config, [key]: Number(event.target.value) })}
                      />
                    </div>
                  ))}
              </div>

              <Switch checked={rule.enabled} onCheckedChange={(checked) => void toggleRule(rule, checked)} aria-label={rule.label} />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function IntegrationsTab() {
  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<{ connections: Connection[]; available: { gmail: boolean; outlook: boolean } }>(
      "/api/integrations/connections",
    ),
  });

  const data = connections.data;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Connected mailboxes</CardTitle>
          <CardDescription>
            Nothing is ever sent without a connected mailbox in your name. Tokens are encrypted at rest (AES-256-GCM) and
            the send scope is requested explicitly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.connections ?? []).length === 0 ? (
            <p className="text-xs italic text-muted-foreground">No mailbox connected yet.</p>
          ) : (
            (data?.connections ?? []).map((connection) => (
              <div key={connection.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
                <div>
                  <p className="text-xs font-medium">
                    {connection.provider === "GOOGLE" ? "Gmail" : "Outlook"} · {connection.emailAddress}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {connection.sentToday}/{connection.dailyLimit} sent today
                    {connection.lastError ? ` · ${connection.lastError}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", connection.status === "ACTIVE" ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300")}>
                  {connection.status.toLowerCase()}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <ProviderCard
          name="Gmail"
          available={data?.available.gmail ?? false}
          connectHref="/api/integrations/google/connect"
          docs="https://console.cloud.google.com/apis/credentials"
          steps={[
            "Create an OAuth client (type: Web application) in Google Cloud Console.",
            "Add http://localhost:3000/api/integrations/google/callback as an authorised redirect URI.",
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, then restart the server.",
          ]}
        />
        <ProviderCard
          name="Outlook"
          available={data?.available.outlook ?? false}
          connectHref="/api/integrations/outlook/connect"
          docs="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps"
          steps={[
            "Register an application in the Azure / Entra portal (Web platform).",
            "Add http://localhost:3000/api/integrations/outlook/callback as a redirect URI.",
            "Grant delegated Mail.Send and Mail.ReadWrite, then set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in .env.",
          ]}
        />
      </div>
    </>
  );
}

function ProviderCard({
  name,
  available,
  connectHref,
  docs,
  steps,
}: {
  name: string;
  available: boolean;
  connectHref: string;
  docs: string;
  steps: string[];
}) {
  return (
    <Card className={cn(available ? "border-emerald-500/30" : "border-amber-500/30")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{name}</CardTitle>
          <Badge variant="outline" className={cn("text-[10px]", available ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300")}>
            {available ? "configured" : "not configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {available ? (
          <Button size="sm" asChild>
            <a href={connectHref}>
              <Mail className="h-3.5 w-3.5" /> Connect {name}
            </a>
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Credentials are missing, so the connect button stays disabled. Follow these exact steps:
            </p>
            <ol className="ml-4 list-decimal space-y-1 text-[11px] text-muted-foreground">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Button size="xs" variant="ghost" asChild>
              <a href={docs} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" /> Open console
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AiTab() {
  const status = useQuery({
    queryKey: ["ai-status"],
    queryFn: () =>
      api.get<{
        configured: boolean;
        provider: string | null;
        providerLabel: string | null;
        model: string | null;
        freeTier: boolean;
        reason: string;
        setupHint: string;
        reachable: boolean | null;
        catalog: { id: string; label: string; signupUrl: string; setup: string; models: { id: string; label: string; free: boolean; note?: string }[] }[];
      }>("/api/ai/status"),
  });

  const data = status.data;

  return (
    <>
      <Card className={cn(data?.configured ? "border-emerald-500/30" : "border-border/70")}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-primary" /> Active backend
          </CardTitle>
          <CardDescription>{data ? data.reason : "Loading…"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={cn(data?.configured ? "border-emerald-500/30 text-emerald-300" : "")}>
              {data?.providerLabel ?? "Local deterministic engine"}
            </Badge>
            {data?.model && <Badge variant="secondary">{data.model}</Badge>}
            <Badge variant="outline" className={cn(data?.freeTier ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300")}>
              {data?.freeTier ? "free tier" : "paid"}
            </Badge>
            {data?.reachable === false && (
              <Badge variant="outline" className="border-rose-500/30 text-rose-300">
                unreachable
              </Badge>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{data?.setupHint}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Available providers</CardTitle>
          <CardDescription>
            Set one key and restart — the app picks it up automatically. Every option below has a free tier or runs on your
            own machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.catalog ?? []).map((provider) => (
            <div key={provider.id} className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">{provider.label}</p>
                <Button size="xs" variant="ghost" asChild>
                  <a href={provider.signupUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3" /> Get access
                  </a>
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{provider.setup}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {provider.models.map((model) => (
                  <Badge key={model.id} variant="outline" className={cn("text-[10px]", model.free && "border-emerald-500/30 text-emerald-300")}>
                    {model.label}
                    {model.note ? ` · ${model.note}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DataTab() {
  const [confirming, setConfirming] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);

  async function seedDemo() {
    setSeeding(true);
    try {
      const result = await api.post<{
        companies: number;
        jobs: number;
        applications: number;
        contacts: number;
        note?: string;
      }>("/api/demo", {});
      toast.success(
        `Demo data seeded — ${result.companies} companies, ${result.jobs} jobs, ${result.applications} applications, ${result.contacts} contacts`,
      );
      if (result.note) toast.info(result.note);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not seed demo data");
    } finally {
      setSeeding(false);
    }
  }

  async function exportData() {
    try {
      const response = await fetch("/api/account");
      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `applypilot-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Could not export your data");
    }
  }

  async function deleteAccount() {
    try {
      await api.delete("/api/account");
      toast.success("Account and all data deleted");
      window.location.href = "/";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the account");
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> Your data
        </CardTitle>
        <CardDescription>Export everything ApplyPilot stores, or delete the account permanently.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void exportData()}>
            <Download className="h-3.5 w-3.5" /> Export JSON
          </Button>
          <Button size="sm" variant="outline" disabled={seeding} onClick={() => void seedDemo()}>
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
            Seed demo data
          </Button>
          {!confirming ? (
            <Button size="sm" variant="destructive" onClick={() => setConfirming(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete account
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">This cannot be undone.</span>
              <Button size="sm" variant="destructive" onClick={() => void deleteAccount()}>
                Yes, delete everything
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps the control in a real <label> so the input is reachable by clicking the
 * text and is announced correctly by screen readers.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-9 animate-pulse rounded-md bg-muted/50" />
        ))}
      </CardContent>
    </Card>
  );
}
