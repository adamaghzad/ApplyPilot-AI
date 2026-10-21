"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Filter,
  KanbanSquare,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";
import { APPLICATION_STATUSES, APPLICATION_STATUS_COLOR, APPLICATION_STATUS_LABEL } from "@/lib/enums";
import { cn, timeAgo } from "@/lib/utils";
import { ApplicationDetailDialog } from "@/components/applications/application-detail";

export type ApplicationRow = {
  application: {
    id: string;
    status: string;
    scheduledFor: string | null;
    compatibilityScore: number | null;
    recipientEmail: string | null;
    sentAt: string | null;
    updatedAt: string;
    notes: string | null;
  };
  job: { id: string; title: string; location: string | null; remote: string; source: string };
  company: { id: string; name: string; researchStatus: string };
};

const BOARD_COLUMNS = APPLICATION_STATUSES.filter((status) => status !== "RESEARCHING");

/** Provenance of the recipient address, shown so nothing looks invented. */
function SourceBadge({ email, verified }: { email: string | null; verified?: boolean }) {
  if (!email) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CircleDashed className="h-3 w-3" /> no recipient found
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={email}>
      <ShieldCheck className={cn("h-3 w-3", verified ? "text-emerald-400" : "text-amber-400")} />
      <span className="max-w-[130px] truncate">{email}</span>
    </span>
  );
}

export function ApplicationsBoard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [minScore, setMinScore] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const applications = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.get<{ applications: ApplicationRow[] }>("/api/applications"),
    refetchInterval: 20_000,
  });

  const rows = applications.data?.applications ?? [];
  const filtered = rows.filter((row) => {
    const score = row.application.compatibilityScore ?? 0;
    if (score < minScore) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      row.job.title.toLowerCase().includes(needle) ||
      row.company.name.toLowerCase().includes(needle) ||
      (row.application.recipientEmail ?? "").toLowerCase().includes(needle)
    );
  });

  const byStatus = React.useMemo(() => {
    const map = new Map<string, ApplicationRow[]>();
    for (const status of BOARD_COLUMNS) map.set(status, []);
    for (const row of filtered) {
      const bucket = map.get(row.application.status);
      if (bucket) bucket.push(row);
    }
    return map;
  }, [filtered]);

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);

  async function patchStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await api.patch(`/api/applications/${id}`, { status });
      toast.success(`Moved to ${APPLICATION_STATUS_LABEL[status as keyof typeof APPLICATION_STATUS_LABEL] ?? status}`);
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move the application");
    } finally {
      setBusyId(null);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await api.post(`/api/applications/${id}/approve`, {});
      toast.success("Approved — ready to send");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve");
    } finally {
      setBusyId(null);
    }
  }

  async function sendNow(id: string) {
    setBusyId(id);
    try {
      await api.post(`/api/applications/${id}/send`, {});
      toast.success("Application sent through your mailbox");
      invalidate();
    } catch (error) {
      // The API refuses (no mailbox, outside window, daily cap…) — never fake it.
      toast.error(error instanceof Error ? error.message : "Send failed");
    } finally {
      setBusyId(null);
    }
  }

  async function emergencyStop() {
    try {
      await api.post("/api/automation/stop", {});
      toast.warning("Automation stopped — pending sends cancelled");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop automation");
    }
  }

  const scoreThresholds = [0, 50, 70, 85];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <KanbanSquare className="h-5 w-5 text-primary" /> Application pipeline
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every card is a real record. Drag between columns to update status, open a card to review the draft before
            anything leaves your mailbox.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void applications.refetch()} disabled={applications.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", applications.isFetching && "animate-spin")} /> Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={emergencyStop}>
            <Square className="h-3.5 w-3.5" /> Emergency stop
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search company, role or recipient…"
            className="pl-9"
            aria-label="Search applications"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1">
            {scoreThresholds.map((threshold) => (
              <Button
                key={threshold}
                variant={minScore === threshold ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setMinScore(threshold)}
              >
                {threshold === 0 ? "All" : `${threshold}%+`}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {applications.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-xl border border-border/60 bg-card/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <KanbanSquare className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No applications yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add companies, run discovery, then prepare an application — it lands in the approval queue for review.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="-mx-1 overflow-x-auto pb-3">
          <div className="flex min-w-max gap-3 px-1">
            {BOARD_COLUMNS.map((status) => {
              const cards = byStatus.get(status) ?? [];
              return (
                <section
                  key={status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/plain") || dragging;
                    setDragging(null);
                    if (id && cards.every((card) => card.application.id !== id)) void patchStatus(id, status);
                  }}
                  className={cn(
                    "flex w-[272px] shrink-0 flex-col rounded-xl border border-border/70 bg-card/40 backdrop-blur transition-colors",
                    dragging && "border-primary/40",
                  )}
                >
                  <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          APPLICATION_STATUS_COLOR[status].split(" ")[0].replace("/15", ""),
                        )}
                      />
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {APPLICATION_STATUS_LABEL[status]}
                      </h2>
                    </div>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {cards.length}
                    </span>
                  </header>

                  <div className="flex max-h-[62vh] min-h-[120px] flex-col gap-2 overflow-y-auto p-2">
                    {cards.map((row) => (
                      <motion.article
                        key={row.application.id}
                        layout
                        draggable
                        onDragStart={(event) => {
                          const target = event as unknown as React.DragEvent<HTMLElement>;
                          target.dataTransfer?.setData("text/plain", row.application.id);
                          setDragging(row.application.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSelected(row.application.id)}
                        className={cn(
                          "cursor-grab rounded-lg border border-border/70 bg-background/70 p-3 text-left transition-all hover:border-primary/50 hover:shadow-md active:cursor-grabbing",
                          busyId === row.application.id && "opacity-60",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{row.job.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{row.company.name}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn("shrink-0 text-[11px]", scoreTone(row.application.compatibilityScore ?? 0))}
                          >
                            {row.application.compatibilityScore ?? "—"}
                          </Badge>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-muted-foreground">
                            {row.job.location ?? "—"} · {row.job.remote.toLowerCase()}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {timeAgo(row.application.updatedAt)}
                          </span>
                        </div>

                        <div className="mt-2">
                          <Progress value={row.application.compatibilityScore ?? 0} className="h-1" />
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <SourceBadge email={row.application.recipientEmail} verified />
                          {row.application.scheduledFor && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-indigo-300">
                              <CalendarClock className="h-3 w-3" />
                              {new Date(row.application.scheduledFor).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>

                        {(status === "AWAITING_APPROVAL" || status === "DRAFT_READY" || status === "SCHEDULED") && (
                          <div className="mt-3 flex gap-1.5" onClick={(event) => event.stopPropagation()}>
                            {status !== "SCHEDULED" && (
                              <Button
                                size="xs"
                                variant="secondary"
                                disabled={busyId === row.application.id}
                                onClick={() => void approve(row.application.id)}
                              >
                                {busyId === row.application.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                Approve
                              </Button>
                            )}
                            <Button
                              size="xs"
                              disabled={busyId === row.application.id}
                              onClick={() => void sendNow(row.application.id)}
                            >
                              <Send className="h-3 w-3" /> Send now
                            </Button>
                          </div>
                        )}
                      </motion.article>
                    ))}

                    {cards.length === 0 && (
                      <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-muted-foreground">
                        Drop a card here
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <ApplicationDetailDialog
        applicationId={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          invalidate();
          void applications.refetch();
        }}
      />
    </div>
  );
}

function scoreTone(score: number) {
  if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (score >= 60) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}
