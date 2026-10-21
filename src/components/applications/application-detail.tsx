"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { APPLICATION_STATUSES, APPLICATION_STATUS_COLOR, APPLICATION_STATUS_LABEL, TONES } from "@/lib/enums";
import { cn, timeAgo } from "@/lib/utils";

type Email = {
  id: string;
  subject: string;
  body: string;
  tone: string;
  language: string;
  recipientEmail: string | null;
  personalizationScore: number;
  qualityScore: number;
  model: string;
  createdAt: string;
};

type CoverLetter = { id: string; title: string; content: string; plainText: string; model: string; style: string; language: string };

type Contact = {
  id: string;
  email: string;
  role: string | null;
  sourceUrl: string;
  sourceType: string;
  confidence: number;
  verification: string;
  notes: string | null;
};

type Detail = {
  application: {
    id: string;
    status: string;
    compatibilityScore: number | null;
    recipientEmail: string | null;
    scheduledFor: string | null;
    sentAt: string | null;
    notes: string | null;
    updatedAt: string;
    lastError: string | null;
  };
  job: { id: string; title: string; location: string | null; remote: string; description: string; sourceUrl: string; skills: string[] | null };
  company: { id: string; name: string; website: string | null; researchStatus: string };
  emails: Email[];
  coverLetters: CoverLetter[];
  messages: { id: string; subject: string; snippet: string | null; direction: string; receivedAt: string; fromAddress: string | null }[];
  followUps: { id: string; status: string; dueAt: string }[];
  contacts: Contact[];
  match: { score: number; breakdown: Record<string, number>; explanation: string; matchedSkills: string[]; missingSkills: string[] } | null;
};

const BREAKDOWN_LABEL: Record<string, string> = {
  skills: "Skills",
  experience: "Experience",
  location: "Location & work mode",
  seniority: "Seniority",
  language: "Language",
  recency: "Listing freshness",
};

export function ApplicationDetailDialog({
  applicationId,
  onClose,
  onChanged,
}: {
  applicationId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [letter, setLetter] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tone, setTone] = React.useState<string>("PROFESSIONAL");

  const detail = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => api.get<Detail>(`/api/applications/${applicationId}`),
    enabled: Boolean(applicationId),
  });

  const data = detail.data;
  const email = data?.emails?.[0] ?? null;
  const coverLetter = data?.coverLetters?.[0] ?? null;

  // Keep the local editors in sync whenever a new draft is loaded or regenerated.
  React.useEffect(() => {
    setSubject(email?.subject ?? "");
    setBody(email?.body ?? "");
  }, [email?.id, email?.subject, email?.body]);

  React.useEffect(() => {
    setLetter(coverLetter?.plainText ?? "");
  }, [coverLetter?.id, coverLetter?.plainText]);

  async function run(key: string, action: () => Promise<unknown>, success?: string) {
    setBusy(key);
    try {
      await action();
      if (success) toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const status = data?.application.status ?? "";
  const score = data?.application.compatibilityScore ?? 0;

  return (
    <Dialog open={Boolean(applicationId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        {!data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading application…
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
                <div>
                  <DialogTitle className="text-xl">{data.job.title}</DialogTitle>
                  <DialogDescription>
                    {data.company.name}
                    {data.job.location ? ` · ${data.job.location}` : ""} · {data.job.remote.toLowerCase()}
                  </DialogDescription>
                </div>
                <Badge variant="outline" className={APPLICATION_STATUS_COLOR[status as keyof typeof APPLICATION_STATUS_COLOR]}>
                  {APPLICATION_STATUS_LABEL[status as keyof typeof APPLICATION_STATUS_LABEL] ?? status}
                </Badge>
              </div>
            </DialogHeader>

            {data.application.lastError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{data.application.lastError}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "approve",
                    () => api.post(`/api/applications/${data.application.id}/approve`, {}),
                    "Approved — ready to send",
                  )
                }
              >
                {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() =>
                  void run("send", () => api.post(`/api/applications/${data.application.id}/send`, {}), "Application sent")
                }
              >
                {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send now
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  const when = new Date(Date.now() + 60 * 60 * 1000);
                  void run(
                    "schedule",
                    () =>
                      api.patch(`/api/applications/${data.application.id}`, {
                        status: "SCHEDULED",
                        scheduledFor: when.toISOString(),
                      }),
                    `Scheduled for ${when.toLocaleString()}`,
                  );
                }}
              >
                <CalendarClock className="h-3.5 w-3.5" /> Schedule +1h
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "prepare",
                    () => api.post(`/api/jobs/${data.job.id}/prepare`, { force: true }),
                    "Application re-prepared",
                  )
                }
              >
                {busy === "prepare" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Re-prepare
              </Button>
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="letter">Cover letter</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              {/* ── Overview ─────────────────────────────────────────── */}
              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Target className="h-4 w-4 text-primary" /> Compatibility — {score}%
                    </CardTitle>
                    <CardDescription>{data.match?.explanation ?? "No match score recorded yet."}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.match &&
                      Object.entries(data.match.breakdown).map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{BREAKDOWN_LABEL[key] ?? key}</span>
                            <span className="font-medium">{Math.round(Number(value) * 100)}%</span>
                          </div>
                          <Progress value={Number(value) * 100} className="h-1.5" />
                        </div>
                      ))}

                    {data.match && (data.match.matchedSkills.length > 0 || data.match.missingSkills.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {data.match.matchedSkills.map((skill) => (
                          <Badge key={skill} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                            {skill}
                          </Badge>
                        ))}
                        {data.match.missingSkills.map((skill) => (
                          <Badge key={skill} variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                            gap · {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Job listing</CardTitle>
                    <CardDescription>
                      Source:{" "}
                      <a
                        href={data.job.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {data.job.sourceUrl} <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {data.job.description || "No description captured from the source."}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Move to stage</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {APPLICATION_STATUSES.map((next) => (
                      <Button
                        key={next}
                        size="xs"
                        variant={next === status ? "secondary" : "ghost"}
                        disabled={next === status || busy !== null}
                        onClick={() =>
                          void run(
                            "status",
                            () => api.patch(`/api/applications/${data.application.id}`, { status: next }),
                            `Moved to ${APPLICATION_STATUS_LABEL[next]}`,
                          )
                        }
                      >
                        {APPLICATION_STATUS_LABEL[next]}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Email ────────────────────────────────────────────── */}
              <TabsContent value="email" className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    className="h-8 rounded-md border border-input bg-background/70 px-2 text-xs"
                    aria-label="Tone"
                  >
                    {TONES.map((option) => (
                      <option key={option} value={option}>
                        {option.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "regen-email",
                        () => api.post(`/api/applications/${data.application.id}/email`, { tone }),
                        "Email regenerated",
                      )
                    }
                  >
                    {busy === "regen-email" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Regenerate
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(body);
                      toast.success("Email body copied");
                    }}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  {email && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      model {email.model} · personalization {email.personalizationScore}% · quality {email.qualityScore}%
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground" htmlFor="email-subject">
                    Subject
                  </label>
                  <Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground" htmlFor="email-body">
                    Body
                  </label>
                  <Textarea
                    id="email-body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="min-h-[260px] font-mono text-xs leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Recipient: {data.application.recipientEmail ?? "none — add a verified contact first"}
                  </span>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "save-email",
                        () => api.patch(`/api/applications/${data.application.id}/email`, { subject, body }),
                        "Draft saved",
                      )
                    }
                  >
                    {busy === "save-email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save draft
                  </Button>
                </div>
              </TabsContent>

              {/* ── Cover letter ─────────────────────────────────────── */}
              <TabsContent value="letter" className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "regen-letter",
                        () => api.post(`/api/applications/${data.application.id}/cover-letter`, {}),
                        "Cover letter regenerated",
                      )
                    }
                  >
                    {busy === "regen-letter" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Regenerate
                  </Button>
                  {(["pdf", "docx", "md", "txt"] as const).map((format) => (
                    <Button key={format} size="xs" variant="ghost" asChild>
                      <a href={`/api/applications/${data.application.id}/cover-letter/export?format=${format}`} target="_blank" rel="noreferrer">
                        <Download className="h-3 w-3" /> {format.toUpperCase()}
                      </a>
                    </Button>
                  ))}
                  {coverLetter && (
                    <span className="ml-auto text-[11px] text-muted-foreground">model {coverLetter.model}</span>
                  )}
                </div>

                <Textarea
                  value={letter}
                  onChange={(event) => setLetter(event.target.value)}
                  className="min-h-[320px] text-xs leading-relaxed"
                  aria-label="Cover letter"
                />

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "save-letter",
                        () => api.patch(`/api/applications/${data.application.id}/cover-letter`, { content: letter }),
                        "Cover letter saved",
                      )
                    }
                  >
                    {busy === "save-letter" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save letter
                  </Button>
                </div>
              </TabsContent>

              {/* ── Contacts (provenance first) ──────────────────────── */}
              <TabsContent value="contacts" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Addresses are only stored when they were observed on a public page. ApplyPilot never guesses an address —
                  each one keeps the page it came from and a verification state.
                </p>

                {data.contacts.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                      <ShieldAlert className="h-4 w-4" /> No verified contact found — research the company first.
                    </CardContent>
                  </Card>
                ) : (
                  data.contacts.map((contact) => (
                    <Card key={contact.id}>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{contact.email}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[11px]">
                              confidence {Math.round(contact.confidence * 100)}%
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px]",
                                contact.verification === "VERIFIED_PUBLIC"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                              )}
                            >
                              {contact.verification === "VERIFIED_PUBLIC" ? (
                                <BadgeCheck className="mr-1 h-3 w-3" />
                              ) : (
                                <ShieldAlert className="mr-1 h-3 w-3" />
                              )}
                              {contact.verification.replace(/_/g, " ").toLowerCase()}
                            </Badge>
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground">
                          {contact.role ? `${contact.role} · ` : ""}
                          {contact.sourceType.replace(/_/g, " ").toLowerCase()} ·{" "}
                          <a
                            href={contact.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            source <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        {contact.notes && <p className="text-[11px] italic text-muted-foreground">{contact.notes}</p>}

                        {contact.email !== data.application.recipientEmail && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(
                                "recipient",
                                () =>
                                  api.patch(`/api/applications/${data.application.id}`, { recipientEmail: contact.email }),
                                "Recipient updated",
                              )
                            }
                          >
                            Use this address
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* ── Timeline ─────────────────────────────────────────── */}
              <TabsContent value="timeline" className="space-y-3">
                <div className="space-y-2 text-xs">
                  <TimelineRow
                    icon={<FileText className="h-3 w-3" />}
                    label="Application updated"
                    at={data.application.updatedAt}
                  />
                  {data.application.sentAt && (
                    <TimelineRow icon={<Send className="h-3 w-3" />} label="Email sent" at={data.application.sentAt} />
                  )}
                  {data.application.scheduledFor && (
                    <TimelineRow
                      icon={<CalendarClock className="h-3 w-3" />}
                      label="Scheduled to send"
                      at={data.application.scheduledFor}
                    />
                  )}
                  {data.messages.map((message) => (
                    <TimelineRow
                      key={message.id}
                      icon={<Mail className="h-3 w-3" />}
                      label={`${message.direction === "INBOUND" ? "Received" : "Sent"} — ${message.subject}`}
                      at={message.receivedAt}
                    />
                  ))}
                  {data.followUps.map((followUp) => (
                    <TimelineRow
                      key={followUp.id}
                      icon={<RefreshCw className="h-3 w-3" />}
                      label={`Follow-up ${followUp.status.toLowerCase()}`}
                      at={followUp.dueAt}
                    />
                  ))}
                </div>

                <Separator />

                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      "followup",
                      () => api.post(`/api/applications/${data.application.id}/follow-up`, {}),
                      "Follow-up drafted",
                    )
                  }
                >
                  {busy === "followup" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Draft a follow-up
                </Button>
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TimelineRow({ icon, label, at }: { icon: React.ReactNode; label: string; at: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="shrink-0 text-muted-foreground" title={new Date(at).toLocaleString()}>
        {timeAgo(at)}
      </span>
    </div>
  );
}
