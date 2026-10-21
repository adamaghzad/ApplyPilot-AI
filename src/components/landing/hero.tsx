"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuroraBackground } from "@/components/shared/aurora";
import { DashboardPreview } from "./dashboard-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40">
      <AuroraBackground className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" />
      <div className="pointer-events-none absolute inset-0 -z-10 grid-pattern opacity-40" />

      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <Badge variant="violet" className="mb-6 px-3 py-1">
            <Sparkles className="h-3 w-3" />
            Eight autonomous agents · human-in-the-loop by design
          </Badge>

          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
            Your AI agents run the job search.
            <br />
            <span className="gradient-text">You approve every application.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Upload your CV once. ApplyPilot AI researches target companies, discovers matching vacancies, finds legitimate
            public recruitment contacts, and drafts personalized emails plus unique cover letters — then sends them from
            your own Gmail or Outlook once you approve.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="glow" className="group">
              <Link href="/signup">
                Start free — no card required
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">See the live dashboard</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Nothing is sent without your approval
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Never invents contacts, skills or experience
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              No scraping, no CAPTCHA bypass, no spam
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mx-auto mt-16 max-w-6xl"
        >
          <DashboardPreview />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Product preview — the live dashboard is powered by your own data and real background agents.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
