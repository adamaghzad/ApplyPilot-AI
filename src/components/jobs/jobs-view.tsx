"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";
import { JOB_SOURCES, SOURCE_LABEL } from "@/lib/enums";
import { cn, timeAgo } from "@/lib/utils";

type JobRow = {
  job: {
    id: string;
    title: string;
    location: string | null;
    remote: string;
    seniority: string | null;
    description: string;
    skills: string[] | null;
    sourceUrl: string;
    source: string;
    postedAt: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string;
  };
  company: { id: string; name: string };
  score: number | null;
  explanation: string | null;
  matchedSkills: string[] | null;
  missingSkills: string[] | null;
};

type SourceReport = { source: string; status: string; count: number; reason?: string | null };

type DiscoverResult = {
  discovered: number;
  duplicates: number;
  filteredOut: number;
  sourceReports: SourceReport[];
};

const SOURCE_TONE: Record<string, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  unavailable: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  blocked: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  "rate-limited": "border-orange-500/30 bg-orange-500/10 text-orange-300",
};

export function JobsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [minScore, setMinScore] = React.useState(0);
  const [discovering, setDiscovering] = React.useState(false);
  const [preparing, setPreparing] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<DiscoverResult | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.get<{ jobs: JobRow[] }>("/api/jobs"),
    refetchInterval: 30_000,
  });

  const rows = (jobs.data?.jobs ?? [])
    .filter((row) => (row.score ?? 0) >= minScore)
    .filter((row) =>
      !search.trim()
        ? true
        : `${row.job.title} ${row.company.name} ${(row.job.skills ?? []).join(" ")}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);

  async function discover() {
    setDiscovering(true);
    try {
      const result = await api.post<DiscoverResult>("/api/jobs/discover", {
        keywords: ["Frontend Engineer", "Full-stack Engineer", "Software Engineer"],
        sources: ["GREENHOUSE", "LEVER", "CAREERS_PAGE", "WTTJ"],
        maxAgeDays: 30,
        limit: 25,
      });
      setReport(result);
      if (result.discovered > 0) {
        toast.success(`${result.discovered} new listing(s) found`);
      } else {
        toast.warning("No new listings — see the source report for why");
      }
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function prepare(id: string) {
    setPreparing(id);
    try {
      const result = await api.post<{ application: { id: string; status: string }; skipped?: boolean; reason?: string }>(
        `/api/jobs/${id}/prepare`,
        {},
      );
      if (result.skipped) {
        toast.warning(`Not prepared — ${result.reason ?? "automation rules blocked it"}`);
      } else {
        toast.success("Application drafted — review it in the approval queue");
      }
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare this application");
    } finally {
      setPreparing(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Search className="h-5 w-5 text-primary" /> Job discovery
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Listings come from public job boards and career pages. Every run reports per source what worked and what did
            not, so an empty result is never silently passed off as “no jobs”.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={discovering} onClick={() => void discover()}>
            {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Run discovery
          </Button>
          <Button variant="outline" size="sm" onClick={invalidate} disabled={jobs.isFetching}>
            <Filter className="h-3.5 w-3.5" /> Refresh list
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, company or skill…"
            className="pl-9"
            aria-label="Search jobs"
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
        <div className="flex gap-1">
          {[0, 50, 70, 85].map((threshold) => (
            <Button
              key={threshold}
              size="sm"
              variant={minScore === threshold ? "secondary" : "ghost"}
              onClick={() => setMinScore(threshold)}
            >
              {threshold === 0 ? "All" : `${threshold}%+`}
            </Button>
          ))}
        </div>
      </div>

      {report && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Discovery report</CardTitle>
            <CardDescription>
              {report.discovered} new · {report.duplicates} duplicate(s) · {report.filteredOut} filtered out
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {report.sourceReports.map((entry, index) => (
              <div key={`${entry.source}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className={cn("text-[10px]", SOURCE_TONE[entry.status] ?? SOURCE_TONE.unavailable)}>
                  {entry.status}
                </Badge>
                <span className="font-medium">{entry.source}</span>
                <span className="text-muted-foreground">{entry.count} listing(s)</span>
                {entry.reason && <span className="text-muted-foreground">— {entry.reason}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {jobs.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-xl border border-border/60 bg-card/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No listings yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add companies first, then run discovery — results are matched against your CV automatically.
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href="/companies">Go to companies</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <motion.div key={row.job.id} layout>
              <Card className="h-full border-border/70 bg-card/50 backdrop-blur transition-all hover:border-primary/50 hover:shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{row.job.title}</CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <span>{row.company.name}</span>
                        {row.job.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {row.job.location}
                          </span>
                        )}
                        <span className="text-muted-foreground/70">{row.job.remote.toLowerCase()}</span>
                      </CardDescription>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          "text-lg font-semibold",
                          (row.score ?? 0) >= 80 ? "text-emerald-400" : (row.score ?? 0) >= 60 ? "text-amber-400" : "text-slate-400",
                        )}
                      >
                        {row.score ?? "—"}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">match</div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <Progress value={row.score ?? 0} className="h-1" />

                  {row.explanation && <p className="line-clamp-2 text-xs text-muted-foreground">{row.explanation}</p>}

                  <div className="flex flex-wrap gap-1">
                    {(row.matchedSkills ?? []).slice(0, 5).map((skill) => (
                      <Badge key={skill} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                        {skill}
                      </Badge>
                    ))}
                    {(row.missingSkills ?? []).slice(0, 3).map((skill) => (
                      <Badge key={skill} variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                        gap · {skill}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {SOURCE_LABEL[row.job.source as keyof typeof SOURCE_LABEL] ?? row.job.source}
                      {row.job.postedAt ? ` · ${timeAgo(row.job.postedAt)}` : ""}
                    </span>
                    <div className="flex gap-1.5">
                      <Button size="xs" variant="ghost" onClick={() => setDetailId(row.job.id)}>
                        Details
                      </Button>
                      <Button size="xs" variant="ghost" asChild>
                        <a href={row.job.sourceUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" /> Source
                        </a>
                      </Button>
                      <Button size="xs" disabled={preparing === row.job.id} onClick={() => void prepare(row.job.id)}>
                        {preparing === row.job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Prepare
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <JobDetailDialog jobId={detailId} onClose={() => setDetailId(null)} onPrepare={(id) => void prepare(id)} />
    </div>
  );
}

function JobDetailDialog({
  jobId,
  onClose,
  onPrepare,
}: {
  jobId: string | null;
  onClose: () => void;
  onPrepare: (id: string) => void;
}) {
  const detail = useQuery({
    queryKey: ["job", jobId],
    queryFn: () =>
      api.get<{
        job: JobRow["job"] & { requirements: string[] | null };
        application: { id: string; status: string } | null;
        match: { score: number; breakdown: Record<string, number>; explanation: string; matchedSkills: string[]; missingSkills: string[] } | null;
      }>(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
  });

  const data = detail.data;

  return (
    <Dialog open={Boolean(jobId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {!data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading listing…
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{data.job.title}</DialogTitle>
              <DialogDescription>
                {data.job.location ?? "Location not stated"} · {data.job.remote.toLowerCase()} ·{" "}
                <a href={data.job.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  source <ExternalLink className="h-3 w-3" />
                </a>
              </DialogDescription>
            </DialogHeader>

            {data.match && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-primary" /> Compatibility {data.match.score}%
                  </CardTitle>
                  <CardDescription>{data.match.explanation}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(data.match.breakdown).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">{key}</span>
                        <span>{Math.round(Number(value) * 100)}%</span>
                      </div>
                      <Progress value={Number(value) * 100} className="h-1" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Description</h3>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {data.job.description || "No description captured from the source."}
              </p>
            </div>

            {((data.job.requirements ?? []).length > 0 || (data.job.skills ?? []).length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {(data.job.skills ?? data.job.requirements ?? []).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-[10px]">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}

            {data.application ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Already in your pipeline —{" "}
                  <Link href="/applications" className="text-primary hover:underline">
                    open the board
                  </Link>
                </span>
              </div>
            ) : (
              <Button size="sm" onClick={() => onPrepare(data.job.id)}>
                <Sparkles className="h-3.5 w-3.5" /> Prepare an application
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
