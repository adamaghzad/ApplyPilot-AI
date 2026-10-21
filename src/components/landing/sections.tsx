"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Gauge,
  Globe,
  KanbanSquare,
  Lock,
  Mail,
  Minus,
  PenLine,
  Plus,
  Repeat,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";

function SectionHeading({
  eyebrow,
  title,
  description,
  center = true,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  center?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className={cn("max-w-2xl", center && "mx-auto text-center")}
    >
      <Badge variant="outline" className="mb-4">
        {eyebrow}
      </Badge>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-balance text-muted-foreground">{description}</p>}
    </motion.div>
  );
}

// ───────────────────────────── Features ─────────────────────────────

const FEATURES = [
  {
    icon: Search,
    title: "AI job discovery",
    body: "Public job-board APIs and company career pages, filtered by title, location, remote policy, skills, seniority and recency — with duplicate detection.",
    accent: "from-cyan-500/20 to-blue-500/5",
  },
  {
    icon: Globe,
    title: "Company research",
    body: "Fetches official websites and careers pages, extracts technologies, hiring signals, application procedures and public HR contact channels.",
    accent: "from-sky-500/20 to-indigo-500/5",
  },
  {
    icon: FileText,
    title: "CV intelligence",
    body: "PDF and DOCX parsing into a structured profile: experience, education, skills, certifications, languages, projects and achievements.",
    accent: "from-teal-500/20 to-emerald-500/5",
  },
  {
    icon: Target,
    title: "Explainable matching",
    body: "Every opportunity gets a compatibility score with a per-factor breakdown — skills, experience, location, seniority, language, recency.",
    accent: "from-amber-500/20 to-orange-500/5",
  },
  {
    icon: Mail,
    title: "Personalized emails",
    body: "Concise, human recruitment messages in French or English with formal, professional, friendly or concise tones — scored for personalization.",
    accent: "from-violet-500/20 to-purple-500/5",
  },
  {
    icon: PenLine,
    title: "Unique cover letters",
    body: "A distinct motivation letter per company and role, editable in a rich-text editor, exportable to PDF and DOCX, attached to every application.",
    accent: "from-fuchsia-500/20 to-pink-500/5",
  },
  {
    icon: KanbanSquare,
    title: "Application CRM",
    body: "Drag-and-drop pipeline from discovered to offer, with notes, reminders, full history and recruiter conversations attached to each card.",
    accent: "from-indigo-500/20 to-violet-500/5",
  },
  {
    icon: Repeat,
    title: "Smart follow-ups",
    body: "After seven business days without a reply, the Follow-up Agent drafts a polite nudge — and cancels it the moment a recruiter answers.",
    accent: "from-emerald-500/20 to-teal-500/5",
  },
  {
    icon: Gauge,
    title: "Automation controls",
    body: "Manual, assisted or scheduled modes with daily limits, timezone-aware sending windows, retries, an emergency stop and complete activity logs.",
    accent: "from-brand-500/20 to-indigo-500/5",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-24">
      <div className="container">
        <SectionHeading
          eyebrow="Platform"
          title="Everything a serious job search needs, automated end to end"
          description="Not a template generator. A real pipeline with persistent data, background agents and audit logs you can inspect."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (index % 3) * 0.08 }}
              className={cn(
                "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6 card-hover",
              )}
            >
              <div
                className={cn(
                  "absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                  feature.accent,
                )}
              />
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background/70">
                <feature.icon className="h-5 w-5 text-brand-400" />
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── How it works ───────────────────────────

const STEPS = [
  { icon: FileCheck2, title: "Upload your CV", body: "PDF or DOCX. The CV Analysis Agent builds your structured candidate profile." },
  { icon: Building2, title: "Add target companies", body: "Enter companies manually or paste a list. Set titles, locations, salary and work preferences." },
  { icon: Sparkles, title: "Agents research & discover", body: "Research, Discovery and Matching agents run in the background and rank what fits." },
  { icon: UserCheck, title: "You review & approve", body: "Read the drafted email and cover letter, edit anything, then approve the send." },
  { icon: Mail, title: "Sent from your mailbox", body: "Delivered through your connected Gmail or Outlook, with your CV attached." },
  { icon: Repeat, title: "Tracked & followed up", body: "Replies are detected automatically; follow-ups are drafted if silence persists." },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative border-y border-border/60 bg-muted/20 py-24">
      <div className="container">
        <SectionHeading
          eyebrow="Workflow"
          title="From CV to interview in six controlled steps"
          description="Every step is visible, reversible and logged. Automation never runs ahead of your approval."
        />

        <div className="relative mt-16">
          <div className="absolute left-0 right-0 top-[46px] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent lg:block" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-6">
            {STEPS.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="relative"
              >
                <div className="relative z-10 mx-auto flex h-[92px] w-[92px] items-center justify-center rounded-2xl border border-border/70 bg-card shadow-sm">
                  <step.icon className="h-6 w-6 text-brand-400" />
                  <span className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violetx-500 text-xs font-semibold text-white shadow-glow">
                    {index + 1}
                  </span>
                </div>
                <div className="mt-4 text-center">
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── Agents ───────────────────────────────

const AGENTS = [
  { icon: Globe, name: "Research Agent", body: "Researches companies and public recruitment channels.", accent: "from-sky-500 to-indigo-500" },
  { icon: Search, name: "Job Discovery Agent", body: "Discovers matching vacancies across permitted sources.", accent: "from-cyan-500 to-blue-500" },
  { icon: FileText, name: "CV Analysis Agent", body: "Understands your professional background.", accent: "from-teal-500 to-emerald-500" },
  { icon: Target, name: "Matching Agent", body: "Ranks opportunities with explainable compatibility.", accent: "from-amber-500 to-orange-500" },
  { icon: Mail, name: "Email Writing Agent", body: "Creates professional personalized messages.", accent: "from-violet-500 to-purple-500" },
  { icon: PenLine, name: "Cover Letter Agent", body: "Writes a unique motivation letter per role.", accent: "from-fuchsia-500 to-pink-500" },
  { icon: Gauge, name: "Automation Agent", body: "Coordinates approvals, scheduling and sending.", accent: "from-indigo-500 to-violet-500" },
  { icon: Repeat, name: "Follow-up Agent", body: "Drafts follow-ups when replies go quiet.", accent: "from-emerald-500 to-teal-500" },
];

export function AgentsSection() {
  return (
    <section id="agents" className="relative py-24">
      <div className="container">
        <SectionHeading
          eyebrow="Agent command center"
          title="Eight specialized agents, one coordinated workflow"
          description="Watch every agent work in real time: idle, researching, generating, awaiting approval, completed or failed — with live progress and full run history."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((agent, index) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (index % 4) * 0.07 }}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 card-hover"
            >
              <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-60", agent.accent)} />
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white", agent.accent)}>
                  <agent.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{agent.name}</p>
                  <p className="text-[11px] text-muted-foreground">Idle → Running → Completed</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{agent.body}</p>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${60 + index * 5}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, delay: 0.2 }}
                  className={cn("h-full rounded-full bg-gradient-to-r", agent.accent)}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-10 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6"
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {["Research Agent", "Discovery Agent", "Matching Agent", "Email Agent", "Cover Letter Agent", "Automation Agent"].map(
              (name, index, array) => (
                <React.Fragment key={name}>
                  <span className="rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium">{name}</span>
                  {index < array.length - 1 && (
                    <span className="relative h-px w-6 bg-border">
                      <span className="absolute inset-0 bg-gradient-to-r from-brand-400 to-violetx-400" style={{ animation: "dash-flow 1.5s linear infinite" }} />
                    </span>
                  )}
                </React.Fragment>
              ),
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Live agent graph: every node streams its status over server-sent events, so the command center reflects real
            backend work — not a simulation.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────── Security ─────────────────────────────

const SECURITY = [
  { icon: Lock, title: "Encrypted OAuth tokens", body: "Gmail and Outlook tokens are encrypted at rest with AES-256-GCM and refreshed automatically." },
  { icon: ShieldCheck, title: "Least-privilege scopes", body: "Send, read and profile scopes only. No mailbox-wide access, no contact harvesting." },
  { icon: Server, title: "Per-user isolation", body: "Every query is scoped to the authenticated user; object-level authorization is enforced server-side." },
  { icon: Gauge, title: "Provider-safe sending", body: "Daily caps, sending windows and automatic pauses honour Gmail and Microsoft Graph rate limits." },
  { icon: FileCheck2, title: "Audit logs", body: "Every approval, send, research run and configuration change is recorded with timestamp and metadata." },
  { icon: Trash2, title: "Export & deletion", body: "Download your data as JSON and permanently delete your account and files at any time." },
];

export function SecuritySection() {
  return (
    <section id="security" className="relative border-y border-border/60 bg-muted/20 py-24">
      <div className="container">
        <SectionHeading
          eyebrow="Security & privacy"
          title="Built the way a recruiter-facing tool must be built"
          description="We never send an unapproved message, never invent a contact, and never attempt to bypass login walls, CAPTCHAs or rate limits."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (index % 3) * 0.08 }}
              className="flex gap-4 rounded-2xl border border-border/60 bg-card/60 p-5"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70">
                <item.icon className="h-4 w-4 text-emerald-400" />
              </span>
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── Metrics ──────────────────────────────

export function MetricsSection() {
  const metrics = [
    { value: 8, label: "Specialized AI agents", suffix: "" },
    { value: 6, label: "Job sources supported", suffix: "" },
    { value: 2, label: "Mailbox integrations", suffix: "" },
    { value: 100, label: "Human approval before sending", suffix: "%" },
  ];

  return (
    <section className="py-16">
      <div className="container">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border/60 bg-card/50 p-8 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="text-center">
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
                <AnimatedCounter value={metric.value} suffix={metric.suffix} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── Pricing ──────────────────────────────

const PLANS = [
  {
    name: "Free",
    price: 0,
    description: "Explore the platform with your own data.",
    features: ["1 CV profile", "5 target companies", "25 discovered jobs / month", "Email + cover letter drafts", "Manual sending mode"],
    cta: "Start free",
    variant: "outline" as const,
  },
  {
    name: "Pro",
    price: 39,
    description: "Full automation with human approval.",
    features: [
      "Unlimited companies & jobs",
      "All 8 AI agents",
      "Gmail + Outlook sending",
      "Scheduled sending windows",
      "Follow-up automation",
      "PDF / DOCX exports",
    ],
    cta: "Go Pro",
    variant: "glow" as const,
    popular: true,
  },
  {
    name: "Scale",
    price: 99,
    description: "For teams and career services.",
    features: ["Multiple candidate workspaces", "Shared company lists", "Priority agent queue", "Audit log export", "Dedicated support"],
    cta: "Contact us",
    variant: "outline" as const,
  },
];

export function PricingSection() {
  const [annual, setAnnual] = React.useState(true);

  return (
    <section id="pricing" className="py-24">
      <div className="container">
        <SectionHeading eyebrow="Pricing" title="Simple plans that scale with your search" description="Cancel anytime. Your data stays yours — export or delete it whenever you want." />

        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/60 p-1">
            <button
              onClick={() => setAnnual(true)}
              className={cn("rounded-full px-4 py-1.5 text-xs font-medium transition-colors", annual ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")}
            >
              Annual · −20%
            </button>
            <button
              onClick={() => setAnnual(false)}
              className={cn("rounded-full px-4 py-1.5 text-xs font-medium transition-colors", !annual ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")}
            >
              Monthly
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, index) => {
            const price = annual ? Math.round(plan.price * 0.8) : plan.price;
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-card/60 p-7",
                  plan.popular ? "gradient-border border-transparent shadow-glow" : "border-border/60",
                )}
              >
                {plan.popular && (
                  <Badge variant="violet" className="absolute -top-3 left-7">
                    Most popular
                  </Badge>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">${price}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant={plan.variant} className="mt-8 w-full">
                  <Link href="/signup">{plan.cta}</Link>
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────── FAQ ────────────────────────────────

const FAQS = [
  {
    q: "Will ApplyPilot send emails without asking me?",
    a: "No. Every application requires an explicit approval in the review queue. In Manual mode you approve each step; in Assisted mode the agents draft everything and you approve sending; in Scheduled mode approved applications are delivered inside a sending window you define.",
  },
  {
    q: "Where do the recruiter email addresses come from?",
    a: "Only from public pages the Research Agent actually fetched — company websites, careers pages and public directories. Each contact stores its source URL, a confidence score and a verification status. Addresses inferred from an observed public pattern are labelled PATTERN_INFERRED with low confidence, and nothing is ever fabricated.",
  },
  {
    q: "Do you scrape LinkedIn or bypass anti-bot protections?",
    a: "Never. LinkedIn and Indeed are queried only through authorised partner or publisher APIs when you supply credentials. Without them, those adapters report themselves as unavailable rather than scraping, and the UI tells you exactly why.",
  },
  {
    q: "Can the AI invent experience I don't have?",
    a: "No. Prompts enforce strict grounding: every claim must come from your CV or the researched company data. The CV parser never invents employers, dates, certifications or achievements, and generated content is scored for placeholders and spam language.",
  },
  {
    q: "What happens if I don't have an OpenAI key?",
    a: "The platform ships with a deterministic local engine that parses CVs, scores matches, and composes emails and cover letters from your real data. It works offline with no key — add OPENAI_API_KEY at any time to switch to LLM generation. The UI always shows which engine produced a draft.",
  },
  {
    q: "How is my data stored?",
    a: "Everything lives in your own PostgreSQL database (an embedded engine runs locally with zero setup). Uploaded CVs are stored under a per-user directory, OAuth tokens are encrypted with AES-256-GCM, and you can export or permanently delete all of your data from Settings.",
  },
  {
    q: "Can I use it in French?",
    a: "Yes. Set your preferred application language to French and the CV analysis, emails, cover letters and follow-ups are generated in French, with matching salutations and conventions.",
  },
  {
    q: "What if an email provider rate-limits me?",
    a: "The automation pauses immediately, marks the mailbox as rate limited, and automatically retries after a cooldown. Daily caps and sending windows prevent the situation arising in the first place.",
  },
];

export function FaqSection() {
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-border/60 py-24">
      <div className="container max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered honestly" />
        <div className="mt-12 space-y-3">
          {FAQS.map((faq, index) => {
            const isOpen = open === index;
            return (
              <div key={faq.q} className="overflow-hidden rounded-xl border border-border/60 bg-card/50">
                <button
                  onClick={() => setOpen(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-medium">{faq.q}</span>
                  {isOpen ? <Minus className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="px-5 pb-5">
                    <p className="text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────── CTA ────────────────────────────────

export function CtaSection() {
  return (
    <section className="py-24">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 px-8 py-16 text-center"
        >
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand-500/15 via-transparent to-violetx-500/15" />
          <div className="pointer-events-none absolute -left-20 -top-20 -z-10 h-72 w-72 rounded-full bg-brand-500/20 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-24 -right-10 -z-10 h-72 w-72 rounded-full bg-violetx-500/20 blur-[100px]" />

          <Badge variant="violet" className="mb-5">
            <Clock className="h-3 w-3" />
            Setup takes about four minutes
          </Badge>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Let the agents do the searching.
            <br />
            <span className="gradient-text">Keep the decisions.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
            Upload your CV, add the companies you care about, and review beautifully drafted applications in your inbox —
            ready for a single click of approval.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="glow">
              <Link href="/signup">Create your free account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────── Footer ───────────────────────────────

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-12">
      <div className="container flex flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bot className="h-4 w-4 text-brand-400" />
          ApplyPilot AI — autonomous agents, human approval.
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-5 text-xs text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#agents" className="hover:text-foreground">Agents</a>
          <a href="#security" className="hover:text-foreground">Security</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
      </div>
      <div className="container mt-6 text-center text-xs text-muted-foreground sm:text-left">
        © {new Date().getFullYear()} ApplyPilot AI. We never send an application you have not approved.
      </div>
    </footer>
  );
}
