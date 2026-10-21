"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Building2,
  CheckCircle2,
  Mail,
  Sparkles,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATS = [
  { label: "Companies researched", value: "128", delta: "+12", icon: Building2 },
  { label: "Opportunities found", value: "412", delta: "+38", icon: Target },
  { label: "Applications sent", value: "96", delta: "+9", icon: Mail },
  { label: "Recruiter replies", value: "27", delta: "+4", icon: Activity },
];

const AGENTS = [
  { name: "Research Agent", state: "Researching Acme Robotics", progress: 82, tone: "from-sky-500 to-indigo-500" },
  { name: "Job Discovery Agent", state: "3 vacancies found", progress: 100, tone: "from-cyan-500 to-blue-500" },
  { name: "Matching Agent", state: "92% compatibility", progress: 92, tone: "from-amber-500 to-orange-500" },
  { name: "Email Writing Agent", state: "Personalized message drafted", progress: 100, tone: "from-violet-500 to-purple-500" },
  { name: "Cover Letter Agent", state: "PDF generated", progress: 100, tone: "from-fuchsia-500 to-pink-500" },
  { name: "Automation Agent", state: "Awaiting your approval", progress: 60, tone: "from-indigo-500 to-violet-500" },
];

const PIPELINE = [
  { column: "Discovered", items: ["Senior Frontend Engineer · Nortex", "Full-stack Dev · Lumen"] },
  { column: "Draft ready", items: ["React Engineer · Ovia"] },
  { column: "Awaiting approval", items: ["Platform Engineer · Skyward"] },
  { column: "Applied", items: ["Frontend Lead · Vela", "Node Engineer · Kite"] },
  { column: "Interview", items: ["Staff Engineer · Aurora"] },
];

export function DashboardPreview() {
  const [tab, setTab] = React.useState<"dashboard" | "agents" | "pipeline">("dashboard");

  return (
    <div className="relative">
      <div className="absolute -inset-x-10 -top-10 bottom-10 -z-10 rounded-[3rem] bg-gradient-to-tr from-brand-500/20 via-violetx-500/10 to-transparent blur-3xl" />
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-400/70" />
            <span className="h-3 w-3 rounded-full bg-amber-400/70" />
            <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
          </div>
          <div className="mx-2 flex-1 truncate rounded-md bg-background/60 px-3 py-1 text-xs text-muted-foreground">
            app.applypilot.ai/dashboard
          </div>
          <Badge variant="success" className="hidden sm:inline-flex">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live
          </Badge>
        </div>

        <div className="flex items-center gap-1 border-b border-border/60 px-4 py-2">
          {(
            [
              { key: "dashboard", label: "Dashboard", icon: Activity },
              { key: "agents", label: "Agents", icon: Bot },
              { key: "pipeline", label: "Pipeline", icon: Target },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === item.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-[320px] p-5">
          {tab === "dashboard" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {STATS.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                    className="rounded-xl border border-border/60 bg-background/50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <stat.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-emerald-400">{stat.delta}</span>
                    </div>
                    <p className="mt-2 text-xl font-semibold tracking-tight">{stat.value}</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">{stat.label}</p>
                  </motion.div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2 rounded-xl border border-border/60 bg-background/50 p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Application activity</p>
                  <div className="flex h-28 items-end gap-1.5">
                    {[38, 52, 44, 66, 58, 78, 62, 84, 72, 92, 80, 96].map((height, index) => (
                      <motion.div
                        key={index}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: index * 0.04, type: "spring", stiffness: 120 }}
                        className="flex-1 rounded-t bg-gradient-to-t from-brand-500/30 to-brand-400"
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Agent activity</p>
                  <div className="space-y-2.5">
                    {AGENTS.slice(0, 4).map((agent) => (
                      <div key={agent.name} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="truncate text-muted-foreground">{agent.name}</span>
                          <span className="text-foreground/70">{agent.progress}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${agent.progress}%` }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className={cn("h-full rounded-full bg-gradient-to-r", agent.tone)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {tab === "agents" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2.5">
              {AGENTS.map((agent, index) => (
                <motion.div
                  key={agent.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-3"
                >
                  <span className={cn("h-8 w-1.5 rounded-full bg-gradient-to-b", agent.tone)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{agent.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{agent.state}</p>
                  </div>
                  {agent.progress === 100 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                    </span>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}

          {tab === "pipeline" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-5 gap-2">
              {PIPELINE.map((column, columnIndex) => (
                <div key={column.column} className="rounded-xl border border-border/60 bg-background/40 p-2">
                  <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {column.column}
                  </p>
                  <div className="space-y-1.5">
                    {column.items.map((item, index) => (
                      <motion.div
                        key={item}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: columnIndex * 0.05 + index * 0.05 }}
                        className="rounded-lg border border-border/60 bg-card p-2 text-[10px] leading-tight"
                      >
                        {item}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-brand-400" />
            8 agents · 1 approval queue
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-brand-400">
            Open the real dashboard
            <ArrowUpRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
