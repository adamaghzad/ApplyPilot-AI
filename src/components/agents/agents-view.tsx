"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDashed,
  Cpu,
  Loader2,
  Mail,
  PenLine,
  PlayCircle,
  Repeat,
  Search,
  Square,
  Target,
  Zap,
  FileText,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api-client";
import { useRealtime } from "@/hooks/use-realtime";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn, timeAgo } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  Search,
  FileText,
  Target,
  Mail,
  PenLine,
  Zap,
  Repeat,
};

type Run = {
  id: string;
  status: string;
  progress: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  model: string | null;
};

type Agent = {
  name: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  run: Run | null;
};

type Payload = {
  engine: string;
  engineLabel: string;
  model: string | null;
  freeTier: boolean;
  agents: Agent[];
  runs: (Run & { agent: string })[];
  activity: { id: string; agent: string; message: string; type: string; createdAt: string }[];
};

const RUN_TONE: Record<string, string> = {
  RUNNING: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  QUEUED: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  CANCELLED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

export function AgentsView() {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const { connected } = useRealtime(true);
  const [running, setRunning] = React.useState(false);

  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Payload>("/api/agents"),
    refetchInterval: 10_000,
  });

  const data = agents.data;
  const active = (data?.agents ?? []).filter((agent) => agent.run?.status === "RUNNING");

  async function triggerRun() {
    setRunning(true);
    try {
      const result = await api.post<{ queued: boolean }>("/api/automation/run", {});
      toast.success(result.queued ? "Automation cycle queued" : "Nothing to run right now");
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the cycle");
    } finally {
      setRunning(false);
    }
  }

  async function emergencyStop() {
    try {
      await api.post("/api/automation/stop", {});
      toast.warning("All pending agent tasks cancelled");
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop automation");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="h-5 w-5 text-primary" /> AI agent command center
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Eight specialised agents cooperate on every application. The graph shows the pipeline; the feed shows the real
            events recorded in the database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-[11px]">
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-slate-500")} />
            {connected ? "Live stream connected" : "Polling"}
          </Badge>
          <Button size="sm" disabled={running} onClick={() => void triggerRun()}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            Run cycle
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void emergencyStop()}>
            <Square className="h-3.5 w-3.5" /> Emergency stop
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-primary" /> Model backend
          </CardTitle>
          <CardDescription>
            {data
              ? `${data.engineLabel}${data.model ? ` · ${data.model}` : ""}${data.freeTier ? " · free tier" : ""}`
              : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {data?.engine === "local-deterministic"
              ? "No model is configured, so every agent runs on ApplyPilot's deterministic engine: scoring, drafting and follow-ups are computed from your CV and the listing — nothing is invented. Add a free provider in Settings to enable generative prose."
              : "Agents call this provider for prose and explanations, then fall back to the deterministic engine if a call fails. Numeric scores always come from the deterministic engine."}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AgentGraph agents={data?.agents ?? []} activeCount={active.length} reduced={reduced} />

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" /> Live activity
            </CardTitle>
            <CardDescription>Recorded events, newest first</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[420px] px-4">
              <div className="space-y-2 pb-4">
                {(data?.activity ?? []).length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No activity yet.</p>
                ) : (
                  (data?.activity ?? []).map((event) => (
                    <div key={event.id} className="rounded-lg border border-border/60 bg-card/40 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{event.agent}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(event.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed">{event.message}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(data?.agents ?? []).map((agent) => {
          const Icon = ICONS[agent.icon] ?? Bot;
          const run = agent.run;
          const isRunning = run?.status === "RUNNING";
          return (
            <motion.div key={agent.name} layout>
              <Card className="h-full border-border/70 bg-card/50 backdrop-blur">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white",
                        agent.accent,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-sm">{agent.label}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <CardDescription className="text-xs">{agent.description}</CardDescription>

                  <div className="flex items-center justify-between gap-2">
                    {run ? (
                      <Badge variant="outline" className={cn("text-[10px]", RUN_TONE[run.status] ?? RUN_TONE.QUEUED)}>
                        {isRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {run.status.toLowerCase()}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        <CircleDashed className="mr-1 h-3 w-3" /> idle
                      </Badge>
                    )}
                    {run && <span className="text-[10px] text-muted-foreground">{timeAgo(run.startedAt)}</span>}
                  </div>

                  {run?.message && <p className="line-clamp-2 text-[11px] text-muted-foreground">{run.message}</p>}
                  {run?.model && <p className="text-[10px] text-muted-foreground/70">model {run.model}</p>}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Circular orchestration graph. Nodes are positioned mathematically and joined by
 * SVG arcs; a pulse travels along each arc while any agent is running. With
 * `prefers-reduced-motion` the animation is disabled and the graph renders static.
 */
function AgentGraph({ agents, activeCount, reduced }: { agents: Agent[]; activeCount: number; reduced: boolean }) {
  const size = 340;
  const center = size / 2;
  const radius = 118;
  const nodes = agents.length > 0 ? agents : [];

  const points = nodes.map((agent, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      agent,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      angle,
    };
  });

  const flowing = activeCount > 0 && !reduced;

  return (
    <Card className="border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Orchestration graph</CardTitle>
        <CardDescription>
          {activeCount > 0 ? `${activeCount} agent(s) running` : "Idle — trigger a cycle to see the flow animate"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center py-2">
        <div className="relative w-full max-w-[360px]">
          <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full" role="img" aria-label="Agent orchestration graph">
            <defs>
              <linearGradient id="hubGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>

            {/* Arcs from the hub to each agent */}
            {points.map((point, index) => {
              const midX = (center + point.x) / 2;
              const midY = (center + point.y) / 2;
              return (
                <motion.path
                  key={`${point.agent.name}-arc`}
                  d={`M ${center} ${center} Q ${midX + (midY - center) * 0.25} ${midY - (midX - center) * 0.25} ${point.x} ${point.y}`}
                  fill="none"
                  stroke="url(#hubGradient)"
                  strokeWidth={1.5}
                  strokeOpacity={0.35}
                  strokeDasharray="4 6"
                  animate={flowing ? { strokeDashoffset: [0, -20] } : { strokeDashoffset: 0 }}
                  transition={flowing ? { duration: 1.2, repeat: Infinity, ease: "linear" } : { duration: 0 }}
                />
              );
            })}

            {/* Hub */}
            <motion.circle
              cx={center}
              cy={center}
              r={30}
              fill="url(#hubGradient)"
              fillOpacity={0.18}
              stroke="url(#hubGradient)"
              strokeWidth={2}
              animate={flowing ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={flowing ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
              style={{ transformOrigin: `${center}px ${center}px` }}
            />
            <text x={center} y={center + 4} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
              ApplyPilot
            </text>

            {/* Agent nodes */}
            {points.map((point) => {
              const isRunning = point.agent.run?.status === "RUNNING";
              return (
                <g key={point.agent.name}>
                  <motion.circle
                    cx={point.x}
                    cy={point.y}
                    r={20}
                    className={cn(
                      "fill-card stroke-2",
                      isRunning ? "stroke-sky-400" : "stroke-border",
                    )}
                    animate={isRunning && !reduced ? { r: [20, 22, 20] } : { r: 20 }}
                    transition={isRunning && !reduced ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
                  />
                  <text x={point.x} y={point.y + 4} textAnchor="middle" className="fill-foreground text-[9px] font-medium">
                    {shortLabel(point.agent.label)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

function shortLabel(label: string) {
  return label.replace(" Agent", "").replace("Job ", "").slice(0, 14);
}
