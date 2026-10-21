"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Building2,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  Plus,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";
import { cn, timeAgo } from "@/lib/utils";

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

type Company = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  targetTitle: string | null;
  researchStatus: string;
  description: string | null;
  technologies: string[] | null;
  researchConfidence: number | null;
  researchNotes: string | null;
  researchData: {
    sources?: { url: string; title?: string; kind?: string }[];
    techStack?: string[];
    hiringSignals?: string[];
    applicationProcess?: string;
  } | null;
  lastResearchedAt: string | null;
  updatedAt: string;
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  IN_PROGRESS: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  READY: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  BLOCKED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

export function CompaniesView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [researching, setResearching] = React.useState<string | null>(null);

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => api.get<{ companies: Company[] }>("/api/companies"),
    refetchInterval: 20_000,
  });

  const rows = (companies.data?.companies ?? []).filter((company) =>
    !search.trim() ? true : company.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["companies"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);

  async function research(id: string, deep = false) {
    setResearching(id);
    try {
      const result = await api.post<{ company: Company; result: { confidence: number; contacts: Contact[]; sources: { url: string }[]; notes: string } }>(
        `/api/companies/${id}/research`,
        { deep },
      );
      const { contacts, sources } = result.result;
      if (sources.length === 0) {
        toast.warning(`No public page could be reached — 0 contacts recorded. ${result.result.notes ?? ""}`.trim());
      } else {
        toast.success(`Research complete — ${sources.length} source(s), ${contacts.length} contact(s)`);
      }
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Research failed");
    } finally {
      setResearching(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Remove ${name} and its contacts? Applications already created are kept.`)) return;
    try {
      await api.delete(`/api/companies/${id}`);
      toast.success(`${name} removed`);
      setDetailId(null);
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the company");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 className="h-5 w-5 text-primary" /> Company research
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Research pulls only from public pages and records where each address was found. If a site cannot be reached,
            ApplyPilot says so and stores nothing rather than inventing a contact.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <Users className="h-3.5 w-3.5" /> Add several
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add company
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter companies…"
          className="pl-9"
          aria-label="Filter companies"
        />
      </div>

      {companies.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-xl border border-border/60 bg-card/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No companies yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the companies you want to target — research then finds public career pages and recruitment contacts.
              </p>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add your first company
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((company) => (
            <motion.div key={company.id} layout>
              <Card
                className="group h-full cursor-pointer border-border/70 bg-card/50 backdrop-blur transition-all hover:border-primary/50 hover:shadow-lg"
                onClick={() => setDetailId(company.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{company.name}</CardTitle>
                      <CardDescription className="truncate">
                        {company.industry ?? (company.website ? new URL(company.website).hostname : "Not researched")}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 text-[11px]", STATUS_TONE[company.researchStatus])}>
                      {company.researchStatus.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {company.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{company.description}</p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">No description captured yet.</p>
                  )}

                  {company.technologies && company.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {company.technologies.slice(0, 6).map((tech) => (
                        <Badge key={tech} variant="secondary" className="text-[10px]">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {company.lastResearchedAt
                        ? `researched ${timeAgo(company.lastResearchedAt)}`
                        : "never researched"}
                    </span>
                    {company.researchConfidence !== null && (
                      <span>confidence {Math.round(company.researchConfidence * 100)}%</span>
                    )}
                  </div>

                  <div className="flex gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={researching === company.id}
                      onClick={() => void research(company.id)}
                    >
                      {researching === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radar className="h-3 w-3" />}
                      Research
                    </Button>
                    {company.website && (
                      <Button size="xs" variant="ghost" asChild>
                        <a href={company.website} target="_blank" rel="noreferrer">
                          <Globe className="h-3 w-3" /> Site
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <AddCompanyDialog open={addOpen} onOpenChange={setAddOpen} onCreated={invalidate} />
      <BulkCompanyDialog open={bulkOpen} onOpenChange={setBulkOpen} onCreated={invalidate} />
      <CompanyDetailDialog
        companyId={detailId}
        onClose={() => setDetailId(null)}
        onResearch={(id) => void research(id, true)}
        onRemove={(id, name) => void remove(id, name)}
        onChanged={invalidate}
        researching={researching}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AddCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [targetTitle, setTargetTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    if (name.trim().length < 2) {
      toast.error("Enter a company name");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/companies", {
        name: name.trim(),
        website: website.trim() || null,
        targetTitle: targetTitle.trim() || null,
      });
      toast.success(`${name.trim()} added`);
      setName("");
      setWebsite("");
      setTargetTitle("");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a company</DialogTitle>
          <DialogDescription>Only the name is required. A website dramatically improves research quality.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Company name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nortex Systems" />
          </Field>
          <Field label="Website">
            <Input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://nortex.com" />
          </Field>
          <Field label="Target role (optional)">
            <Input value={targetTitle} onChange={(event) => setTargetTitle(event.target.value)} placeholder="Senior Frontend Engineer" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add company
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, website, ...rest] = line.split(/[,\t]/).map((part) => part.trim());
        return { name, website: website && website.startsWith("http") ? website : null, targetTitle: rest.join(", ") || null };
      })
      .filter((entry) => entry.name.length >= 2);

    if (lines.length === 0) {
      toast.error("Paste at least one company");
      return;
    }

    setSaving(true);
    try {
      const result = await api.post<{ created: number }>("/api/companies/bulk", { companies: lines });
      toast.success(`${result.created} compan${result.created === 1 ? "y" : "ies"} added`);
      setText("");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk import failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add several companies</DialogTitle>
          <DialogDescription>
            One per line: <code className="text-xs">Company name, https://website.com, Target role</code>
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-[200px] font-mono text-xs"
          placeholder={"Vela Studio, https://vela.studio, Frontend Engineer\nKite Payments, https://kite.example.com"}
        />

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompanyDetailDialog({
  companyId,
  onClose,
  onResearch,
  onRemove,
  onChanged,
  researching,
}: {
  companyId: string | null;
  onClose: () => void;
  onResearch: (id: string) => void;
  onRemove: (id: string, name: string) => void;
  onChanged: () => void;
  researching: string | null;
}) {
  const detail = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => api.get<{ company: Company; contacts: Contact[] }>(`/api/companies/${companyId}`),
    enabled: Boolean(companyId),
  });

  const data = detail.data;
  const hiringSignals = data?.company.researchData?.hiringSignals ?? [];
  const sources = data?.company.researchData?.sources ?? [];

  return (
    <Dialog open={Boolean(companyId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {!data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{data.company.name}</DialogTitle>
              <DialogDescription>
                {data.company.website ? (
                  <a
                    href={data.company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {data.company.website} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "No website recorded"
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <Button size="xs" variant="secondary" disabled={researching === data.company.id} onClick={() => onResearch(data.company.id)}>
                {researching === data.company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Deep research
              </Button>
              <Button size="xs" variant="ghost" onClick={() => onRemove(data.company.id, data.company.name)}>
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            </div>

            {data.company.description && (
              <Card>
                <CardContent className="space-y-2 p-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">{data.company.description}</p>
                  {data.company.researchConfidence !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Research confidence</span>
                        <span>{Math.round(data.company.researchConfidence * 100)}%</span>
                      </div>
                      <Progress value={data.company.researchConfidence * 100} className="h-1" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {hiringSignals.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hiringSignals.map((signal) => (
                  <Badge key={signal} variant="secondary" className="text-[10px]">
                    {signal}
                  </Badge>
                ))}
              </div>
            )}

            {sources.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-medium">Sources consulted</h3>
                <ul className="space-y-1">
                  {sources.map((source) => (
                    <li key={source.url} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase">
                        {source.kind?.replace(/_/g, " ") ?? "page"}
                      </span>
                      <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        {source.title ?? source.url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-medium">Recruitment contacts</h3>
              {data.contacts.length === 0 ? (
                <p className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-6 text-xs text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  None recorded — ApplyPilot will not guess an address.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.contacts.map((contact) => (
                    <div key={contact.id} className="rounded-lg border border-border/60 bg-card/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {contact.email}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {Math.round(contact.confidence * 100)}%
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              contact.verification === "VERIFIED_PUBLIC"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                            )}
                          >
                            {contact.verification === "VERIFIED_PUBLIC" ? (
                              <ShieldCheck className="mr-1 h-3 w-3" />
                            ) : (
                              <ShieldAlert className="mr-1 h-3 w-3" />
                            )}
                            {contact.verification.replace(/_/g, " ").toLowerCase()}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {contact.role ? `${contact.role} · ` : ""}
                        {contact.sourceType.replace(/_/g, " ").toLowerCase()} ·{" "}
                        <a
                          href={contact.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {contact.sourceUrl} <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                      {contact.notes && <p className="mt-1 text-[11px] italic text-muted-foreground">{contact.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.company.researchNotes && (
              <p className="rounded-lg bg-muted/50 p-3 text-[11px] italic text-muted-foreground">
                {data.company.researchNotes}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
