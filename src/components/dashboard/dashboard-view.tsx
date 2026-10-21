"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Inbox,
  Mail,
  PlayCircle,
  Repeat,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { api } from "@/lib/api-client";
import { AGENTS, APPLICATION_STATUS_COLOR, APPLICATION_STATUS_LABEL } from "@/lib/enums";
import { cn, timeAgo } from "@/lib/utils";

type Stats = {
  pipeline: { total: number; sent: number; replied: number; interviews: number; offers: number; awaitingApproval: number; scheduled: number; successRate: number };
  companiesResearched: number;
  opportunities: number;
  newThisWeek: number;
  inboundMessages: number;
  sparkline: { date: string; label: string; sent: number }[];
  statusDistribution: { status: string; count: number }[];
  agentActivity: { agent: string; runs: number }[];
  activity: { id: string; agent: string; message: string; type: string; createdAt: string }[];
  unreadNotifications: number;
};

type ApplicationRow = {
  application: {
    id: string;
    status: string;
    scheduledFor: string | null;
    compatibilityScore: number;
    sentAt: string | null;
    repliedAt: string | null;
    followUpDueAt: string | null;
    updatedAt: string;
  };
  job: { id: string; title: string; location: string | null; remote: string };
  company: { id: string; name: string; researchStatus: string };
};

type AgentPayload = {
  engine: string;
  agents: { name: string; label: string; description: string; icon: string; accent: string; run: { id: string; status: string; progress: number; message: string | null; startedAt: string; finishedAt: string | null; model: string | null } | null }[];
};

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#f87171", "#94a3b8"];

export function DashboardView() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api.get<Stats>("/api/stats"), refetchInterval: 30_000 });
  const applications = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.get<{ applications: ApplicationRow[] }>("/api/applications"),
    refetchInterval: 30_000,
  });
  const agents = useQuery({ queryKey: ["agents"], queryFn: () => api.get<AgentPayload>("/api/agents"), refetchInterval: 15_000 });

  const [running, setRunning] = React.useState(false);

  async function triggerRun() {
    setRunning(true);
    try {
      const result = await api.post<{ queued: boolean }>("/api/automation/run", {});
      toast.success(result.queued ? "Automation cycle queued" : "Nothing to run");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the cycle");
    } finally {
      setRunning(false);
    }
  }

  async function emergencyStop() {
    try {
      await api.post("/api/automation/stop", {});
      toast.warning("Automation stopped — pending tasks cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop automation");
    }
  }

  const data = stats.data;
  const rows = applications.data?.applications ?? [];
  const awaiting = rows.filter((row) => row.application.status === "AWAITING_APPROVAL");
  // Applications sent a while ago with no reply, whose follow-up date has passed.
  const now = Date.now();
  const followUps = rows
    .filter((row) => {
      const app = row.application;
      return app.followUpDueAt && new Date(app.followUpDueAt).getTime() <= now && !app.repliedAt && app.sentAt;
    })
    .sort((a, b) => new Date(a.application.followUpDueAt!).getTime() - new Date(b.application.followUpDueAt!).getTime())
    .slice(0, 4);

  const upcoming = rows
    .filter((row) => row.application.status === "SCHEDULED" && row.application.scheduledFor)
    .sort((a, b) => new Date(a.application.scheduledFor!).getTime() - new Date(b.application.scheduledFor!).getTime())
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Command center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of your agents, pipeline and approvals. {data ? `${data.newThisWeek} new listing(s) this week.` : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={triggerRun} disabled={running}>
            <PlayCircle className="h-4 w-4" />
            {running ? "Queuing…" : "Run discovery now"}
          </Button>
          <Button variant="outline" onClick={emergencyStop}>
            <Square className="h-4 w-4" />
            Emergency stop
          </Button>
          <Button asChild variant="glow">
            <Link href="/companies">
              <Building2 className="h-4 w-4" />
              Add companies
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Companies researched"
          value={data?.companiesResearched ?? 0}
          hint="Target companies in your workspace"
          href="/companies"
          loading={stats.isLoading}
        />
        <StatCard
          icon={Target}
          label="Opportunities discovered"
          value={data?.opportunities ?? 0}
          hint={`${data?.newThisWeek ?? 0} found in the last 7 days`}
          href="/jobs"
          loading={stats.isLoading}
        />
        <StatCard
          icon={Mail}
          label="Applications sent"
          value={data?.pipeline.sent ?? 0}
          hint={`${data?.pipeline.awaitingApproval ?? 0} awaiting approval`}
          href="/applications"
          loading={stats.isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Reply rate"
          value={Math.round((data?.pipeline.successRate ?? 0) * 100)}
          suffix="%"
          hint={`${data?.pipeline.replied ?? 0} replies · ${data?.pipeline.interviews ?? 0} interviews`}
          href="/applications"
          loading={stats.isLoading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat icon={Inbox} label="Awaiting approval" value={data?.pipeline.awaitingApproval ?? 0} loading={stats.isLoading} />
        <MiniStat icon={CalendarClock} label="Scheduled" value={data?.pipeline.scheduled ?? 0} loading={stats.isLoading} />
        <MiniStat icon={Users} label="Recruiter replies" value={data?.inboundMessages ?? 0} loading={stats.isLoading} />
        <MiniStat icon={Briefcase} label="Interviews" value={data?.pipeline.interviews ?? 0} loading={stats.isLoading} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Applications sent</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <AreaChart data={data?.sparkline ?? []}>
                  <defs>
                    <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="sent" stroke="#818cf8" strokeWidth={2} fill="url(#sentGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline</CardTitle>
            <CardDescription>Applications by stage</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie
                    data={(data?.statusDistribution ?? []).map((row) => ({ name: APPLICATION_STATUS_LABEL[row.status as keyof typeof APPLICATION_STATUS_LABEL] ?? row.status, value: Number(row.count) }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {(data?.statusDistribution ?? []).map((row, index) => (
                      <Cell key={row.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Agent monitor */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">AI agent activity</CardTitle>
              <CardDescription>
                Engine: {agents.data?.engine === "openai" ? "OpenAI" : "Local deterministic engine (no API key)"}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/agents">
                Open command center
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {agents.isLoading &&
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}

            {(agents.data?.agents ?? []).slice(0, 6).map((agent, index) => {
              const runningAgent = agent.run?.status === "RUNNING";
              return (
                <motion.div
                  key={agent.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="rounded-lg border border-border/60 bg-background/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", runningAgent ? "bg-emerald-400" : agent.run?.status === "FAILED" ? "bg-rose-400" : "bg-slate-500")} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{agent.label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {agent.run?.message ?? agent.description}
                        </p>
                      </div>
                    </div>
                    <Badge variant={runningAgent ? "success" : agent.run?.status === "FAILED" ? "danger" : "secondary"}>
                      {agent.run?.status?.toLowerCase() ?? "idle"}
                    </Badge>
                  </div>
                  {runningAgent && <Progress value={agent.run?.progress ?? 0} className="mt-2.5 h-1" />}
                </motion.div>
              );
            })}
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live activity</CardTitle>
            <CardDescription>Streamed over server-sent events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {stats.isLoading &&
                Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}

              {(data?.activity ?? []).length === 0 && !stats.isLoading && (
                <div className="py-8 text-center">
                  <Activity className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-xs text-muted-foreground">No activity yet. Add companies, then run discovery.</p>
                </div>
              )}

              {(data?.activity ?? []).map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex gap-2.5"
                >
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      event.type === "SUCCESS" ? "bg-emerald-400" : event.type === "WARNING" ? "bg-amber-400" : event.type === "ERROR" ? "bg-rose-400" : "bg-brand-400",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed">{event.message}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {AGENTS.find((agent) => agent.name === event.agent)?.label ?? event.agent} · {timeAgo(event.createdAt)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Approvals */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Approval queue</CardTitle>
              <CardDescription>Applications ready for your review</CardDescription>
            </div>
            <Badge variant={awaiting.length ? "warning" : "secondary"}>{awaiting.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.isLoading && Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}

            {awaiting.length === 0 && !applications.isLoading && (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  Nothing waiting. Prepared applications appear here with their drafted email and cover letter.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/jobs">Discover jobs</Link>
                </Button>
              </div>
            )}

            {awaiting.slice(0, 4).map((row) => (
              <Link
                key={row.application.id}
                href={`/applications?focus=${row.application.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.company.name} · {row.job.location ?? row.job.remote.toLowerCase()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="success">{Math.round(row.application.compatibilityScore)}%</Badge>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming scheduled actions</CardTitle>
            <CardDescription>Approved applications waiting for their send window</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.isLoading && Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}

            {upcoming.length === 0 && !applications.isLoading && (
              <div className="py-10 text-center">
                <CalendarClock className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  No scheduled sends. Approve an application with a send time, or enable the schedule in Settings.
                </p>
              </div>
            )}

            {upcoming.map((row) => (
              <div key={row.application.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.company.name}</p>
                </div>
                <Badge variant="info">
                  {new Date(row.application.scheduledFor!).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Badge>
              </div>
            ))}

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="flex items-start gap-2.5">
                <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Sending windows, daily limits and follow-up delays are configurable in Settings → Automation rules.
                  Provider rate limits automatically pause and resume the queue.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Follow-ups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Follow-ups due</CardTitle>
          <CardDescription>
            Applications you sent that have not had a reply since the follow-up date
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {applications.isLoading && Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}

          {followUps.length === 0 && !applications.isLoading && (
            <div className="py-8 text-center">
              <Repeat className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                Nothing to chase yet. Follow-ups are drafted automatically once an application has been out for the
                delay you set (7 days by default).
              </p>
            </div>
          )}

          {followUps.map((row) => (
            <Link
              key={row.application.id}
              href={`/applications?focus=${row.application.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.job.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.company.name} · sent {timeAgo(row.application.sentAt!)}
                </p>
              </div>
              <Badge variant="warning">
                due {timeAgo(row.application.followUpDueAt!)}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent applications</CardTitle>
          <CardDescription>Latest activity across your pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 && !applications.isLoading ? (
            <div className="py-10 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Your pipeline is empty</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add target companies or run discovery, and applications will appear here automatically.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button asChild size="sm" variant="glow">
                  <Link href="/companies">Add companies</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/jobs">Run discovery</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.slice(0, 6).map((row) => (
                <Link
                  key={row.application.id}
                  href={`/applications?focus=${row.application.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.job.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.company.name} · updated {timeAgo(row.application.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        APPLICATION_STATUS_COLOR[row.application.status as keyof typeof APPLICATION_STATUS_COLOR],
                      )}
                    >
                      {APPLICATION_STATUS_LABEL[row.application.status as keyof typeof APPLICATION_STATUS_LABEL] ?? row.application.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  suffix,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
  href: string;
  suffix?: string;
  loading?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className="group h-full transition-all hover:-translate-y-0.5 hover:shadow-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background/70">
              <Icon className="h-4 w-4 text-brand-400" />
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-4">
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-semibold tracking-tight">
                <AnimatedCounter value={value} suffix={suffix} />
              </p>
            )}
            <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
            {hint && <p className="mt-1.5 text-[11px] text-muted-foreground/80">{hint}</p>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <div>
          {loading ? <Skeleton className="h-6 w-10" /> : <p className="text-xl font-semibold tracking-tight">{value}</p>}
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
