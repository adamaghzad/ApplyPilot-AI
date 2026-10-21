"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Gauge,
  Loader2,
  Mail,
  Sparkles,
  Target,
  Upload,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/shared/logo";
import { AuroraBackground } from "@/components/shared/aurora";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ParsedCV = {
  fullName: string | null;
  headline: string | null;
  skills: string[];
  experience: { title: string; company: string }[];
  yearsExperience: number;
  suggestedTitles: string[];
  recommendations: string[];
};

const STEPS = [
  { id: 0, label: "About you", icon: UserRound },
  { id: 1, label: "Upload CV", icon: Upload },
  { id: 2, label: "AI analysis", icon: Sparkles },
  { id: 3, label: "Preferences", icon: Target },
  { id: 4, label: "Companies", icon: Building2 },
  { id: 5, label: "Automation", icon: Gauge },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────
  const [basics, setBasics] = React.useState({ fullName: "", headline: "", phone: "", city: "", country: "", linkedinUrl: "", githubUrl: "" });
  const [cvFile, setCvFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [parsed, setParsed] = React.useState<ParsedCV | null>(null);
  const [prefs, setPrefs] = React.useState({
    titles: [] as string[],
    locations: [] as string[],
    skills: [] as string[],
    workModes: ["REMOTE", "HYBRID"] as string[],
    language: "en",
    minSalary: "",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  });
  const [companyDraft, setCompanyDraft] = React.useState({ name: "", website: "", targetTitle: "" });
  const [companies, setCompanies] = React.useState<{ name: string; website: string; targetTitle: string }[]>([]);
  const [automation, setAutomation] = React.useState({ mode: "ASSISTED", dailyApplicationLimit: 10, autoApplyEnabled: false });
  const [titleDraft, setTitleDraft] = React.useState("");
  const [locationDraft, setLocationDraft] = React.useState("");

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<{ profile: { fullName: string | null; headline: string | null; city: string | null; country: string | null; skills: string[]; phone: string | null; linkedinUrl: string | null; githubUrl: string | null } | null }>("/api/profile"),
  });

  React.useEffect(() => {
    const profile = profileQuery.data?.profile;
    if (!profile) return;
    setBasics((prev) => ({
      ...prev,
      fullName: profile.fullName ?? prev.fullName,
      headline: profile.headline ?? prev.headline,
      phone: profile.phone ?? prev.phone,
      city: profile.city ?? prev.city,
      country: profile.country ?? prev.country,
      linkedinUrl: profile.linkedinUrl ?? prev.linkedinUrl,
      githubUrl: profile.githubUrl ?? prev.githubUrl,
    }));
  }, [profileQuery.data]);

  const progress = ((step + 1) / STEPS.length) * 100;

  async function uploadCv() {
    if (!cvFile) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", cvFile);
      const result = await api.upload<{ parsed: ParsedCV }>("/api/cv", formData);
      setParsed(result.parsed);
      if (result.parsed.suggestedTitles?.length) {
        setPrefs((prev) => ({ ...prev, titles: Array.from(new Set([...prev.titles, ...result.parsed!.suggestedTitles.slice(0, 3)])) }));
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setUploading(false);
    }
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/onboarding", {
        profile: {
          fullName: basics.fullName,
          headline: basics.headline,
          phone: basics.phone,
          city: basics.city,
          country: basics.country,
          linkedinUrl: basics.linkedinUrl,
          githubUrl: basics.githubUrl,
        },
        preferences: {
          desiredTitles: prefs.titles,
          desiredLocations: prefs.locations,
          desiredSkills: prefs.skills,
          workModes: prefs.workModes,
          preferredLanguage: prefs.language,
          minSalary: prefs.minSalary ? Number(prefs.minSalary) : null,
          timezone: prefs.timezone,
        },
        automation,
        complete: true,
      });

      if (companies.length) {
        await api.post("/api/companies/bulk", { companies });
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save onboarding");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else void finish();
  }

  return (
    <div className="relative min-h-screen">
      <AuroraBackground className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-60" />

      <header className="flex h-16 items-center justify-between border-b border-border/60 px-4 backdrop-blur-xl">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">Step {step + 1} of {STEPS.length}</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            {STEPS.map((item) => (
              <div key={item.id} className={cn("flex items-center gap-1.5", item.id === step && "text-foreground")}>
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px]",
                    item.id < step ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : item.id === step ? "border-primary bg-primary/15 text-primary" : "border-border",
                  )}
                >
                  {item.id < step ? <Check className="h-3 w-3" /> : item.id + 1}
                </span>
                <span className="hidden sm:inline">{item.label}</span>
              </div>
            ))}
          </div>
          <Progress value={progress} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border/60 bg-card/70 p-6 backdrop-blur-xl sm:p-8"
          >
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Let&apos;s start with you</h1>
                  <p className="mt-1 text-sm text-muted-foreground">These details appear in your applications and emails.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" value={basics.fullName} onChange={(v) => setBasics({ ...basics, fullName: v })} placeholder="Amine Berrada" />
                  <Field label="Headline" value={basics.headline} onChange={(v) => setBasics({ ...basics, headline: v })} placeholder="Senior Frontend Engineer" />
                  <Field label="Phone" value={basics.phone} onChange={(v) => setBasics({ ...basics, phone: v })} placeholder="+212 6 12 34 56 78" />
                  <Field label="City" value={basics.city} onChange={(v) => setBasics({ ...basics, city: v })} placeholder="Casablanca" />
                  <Field label="Country" value={basics.country} onChange={(v) => setBasics({ ...basics, country: v })} placeholder="Morocco" />
                  <Field label="LinkedIn URL" value={basics.linkedinUrl} onChange={(v) => setBasics({ ...basics, linkedinUrl: v })} placeholder="https://linkedin.com/in/…" />
                  <Field label="GitHub / portfolio" value={basics.githubUrl} onChange={(v) => setBasics({ ...basics, githubUrl: v })} placeholder="https://github.com/…" />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Upload your CV</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    PDF, DOCX or TXT. We extract your experience, skills and education locally — nothing is invented.
                  </p>
                </div>

                <label
                  htmlFor="cv"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-background/50 px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <FileText className="h-8 w-8 text-brand-400" />
                  <p className="mt-3 text-sm font-medium">{cvFile ? cvFile.name : "Choose a file or drop it here"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX or TXT · up to 10 MB</p>
                  <input
                    id="cv"
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    onChange={(event) => setCvFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                <Button onClick={uploadCv} disabled={!cvFile || uploading} className="w-full" size="lg" variant="glow">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {uploading ? "Analysing your CV…" : "Upload and analyse"}
                </Button>

                <button onClick={() => setStep(2)} className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline">
                  Skip for now — I&apos;ll add it later
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">CV analysis</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {parsed
                      ? "Here is what we extracted. Correct anything that looks off — accuracy matters more than volume."
                      : "No CV uploaded yet. You can upload one now or continue and add it from the CV page."}
                  </p>
                </div>

                {parsed ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Summary label="Name" value={parsed.fullName ?? "—"} />
                      <Summary label="Headline" value={parsed.headline ?? "—"} />
                      <Summary label="Experience" value={`${parsed.yearsExperience} year(s)`} />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Detected skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {parsed.skills.length ? (
                          parsed.skills.slice(0, 40).map((skill) => (
                            <Badge key={skill} variant="secondary">
                              {skill}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">None detected — add them manually in the CV page.</span>
                        )}
                      </div>
                    </div>

                    {parsed.recommendations.length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                        <p className="mb-2 text-xs font-medium">Suggestions</p>
                        <ul className="space-y-1.5">
                          {parsed.recommendations.map((tip) => (
                            <li key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-center">
                    <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Upload a CV to unlock matching, emails and cover letters.</p>
                    <Button variant="outline" className="mt-4" onClick={() => setStep(1)}>
                      Go back and upload
                    </Button>
                  </div>
                )}

                {parsed && (
                  <div className="space-y-2">
                    <Label>Professional summary</Label>
                    <Textarea
                      defaultValue=""
                      placeholder="Two or three sentences about what you do best."
                      onChange={(event) => setBasics({ ...basics, headline: basics.headline })}
                    />
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">What are you looking for?</h1>
                  <p className="mt-1 text-sm text-muted-foreground">These preferences drive discovery and compatibility scoring.</p>
                </div>

                <TagInput
                  label="Target job titles"
                  placeholder="e.g. Senior Frontend Engineer"
                  values={prefs.titles}
                  draft={titleDraft}
                  setDraft={setTitleDraft}
                  onChange={(titles) => setPrefs({ ...prefs, titles })}
                />
                <TagInput
                  label="Preferred locations"
                  placeholder="e.g. Casablanca, Remote (EU)"
                  values={prefs.locations}
                  draft={locationDraft}
                  setDraft={setLocationDraft}
                  onChange={(locations) => setPrefs({ ...prefs, locations })}
                />

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Work mode</p>
                  <div className="flex flex-wrap gap-2">
                    {["REMOTE", "HYBRID", "ONSITE"].map((mode) => (
                      <button
                        key={mode}
                        onClick={() =>
                          setPrefs((prev) => ({
                            ...prev,
                            workModes: prev.workModes.includes(mode) ? prev.workModes.filter((m) => m !== mode) : [...prev.workModes, mode],
                          }))
                        }
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          prefs.workModes.includes(mode) ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {mode.charAt(0) + mode.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Application language</Label>
                    <select
                      value={prefs.language}
                      onChange={(event) => setPrefs({ ...prefs, language: event.target.value })}
                      className="h-10 w-full rounded-lg border border-input bg-background/70 px-3 text-sm"
                    >
                      <option value="en">English</option>
                      <option value="fr">French</option>
                    </select>
                  </div>
                  <Field label="Minimum salary (optional)" value={prefs.minSalary} onChange={(v) => setPrefs({ ...prefs, minSalary: v })} placeholder="45000" />
                  <Field label="Timezone" value={prefs.timezone} onChange={(v) => setPrefs({ ...prefs, timezone: v })} placeholder="Africa/Casablanca" />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Target companies</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add companies you want to work for. You can always add more later — or let discovery find new ones.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Company name" value={companyDraft.name} onChange={(v) => setCompanyDraft({ ...companyDraft, name: v })} placeholder="Nortex Systems" />
                  <Field label="Website (optional)" value={companyDraft.website} onChange={(v) => setCompanyDraft({ ...companyDraft, website: v })} placeholder="https://…" />
                  <Field label="Target title (optional)" value={companyDraft.targetTitle} onChange={(v) => setCompanyDraft({ ...companyDraft, targetTitle: v })} placeholder="Frontend Engineer" />
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    if (!companyDraft.name.trim()) return;
                    setCompanies((prev) => [...prev, { ...companyDraft, name: companyDraft.name.trim() }]);
                    setCompanyDraft({ name: "", website: "", targetTitle: "" });
                  }}
                  disabled={!companyDraft.name.trim()}
                >
                  Add company
                </Button>

                {companies.length > 0 && (
                  <div className="space-y-2">
                    {companies.map((company, index) => (
                      <div key={`${company.name}-${index}`} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{company.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[company.website, company.targetTitle].filter(Boolean).join(" · ") || "No website yet"}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon-sm" onClick={() => setCompanies((prev) => prev.filter((_, i) => i !== index))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Automation & sending</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose how much the agents may do on their own. Nothing is ever sent without your approval.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { mode: "MANUAL", title: "Manual", body: "Agents research and draft. You approve every step." },
                    { mode: "ASSISTED", title: "Assisted", body: "Agents prepare everything. You approve sending." },
                    { mode: "SCHEDULED", title: "Scheduled", body: "Approved applications go out in a time window." },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      onClick={() => setAutomation({ ...automation, mode: option.mode })}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        automation.mode === option.mode ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted",
                      )}
                    >
                      <p className="text-sm font-medium">{option.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.body}</p>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>Daily application limit</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={automation.dailyApplicationLimit}
                    onChange={(event) => setAutomation({ ...automation, dailyApplicationLimit: Number(event.target.value) })}
                  />
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-brand-400" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Connect your mailbox</p>
                      <p className="mt-1">
                        You can connect Gmail or Outlook now or later from Settings → Integrations. Without a mailbox,
                        applications are prepared for you to send manually through the official job links.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={next} disabled={saving} variant="glow">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {step === STEPS.length - 1 ? "Finish setup" : "Continue"}
                {!saving && step !== STEPS.length - 1 && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function TagInput({
  label,
  placeholder,
  values,
  draft,
  setDraft,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  draft: string;
  setDraft: (value: string) => void;
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) {
              event.preventDefault();
              onChange(Array.from(new Set([...values, draft.trim()])));
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!draft.trim()) return;
            onChange(Array.from(new Set([...values, draft.trim()])));
            setDraft("");
          }}
        >
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant="secondary" className="gap-1">
            {value}
            <button onClick={() => onChange(values.filter((v) => v !== value))} aria-label={`Remove ${value}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
