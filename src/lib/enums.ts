import type { AgentName, ApplicationStatus } from "@/lib/db/schema";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "DISCOVERED",
  "RESEARCHING",
  "DRAFT_READY",
  "AWAITING_APPROVAL",
  "SCHEDULED",
  "SENT",
  "REPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "FAILED",
];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  DISCOVERED: "Discovered",
  RESEARCHING: "Researching",
  DRAFT_READY: "Draft ready",
  AWAITING_APPROVAL: "Awaiting approval",
  SCHEDULED: "Scheduled",
  SENT: "Applied",
  REPLIED: "Recruiter replied",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

export const APPLICATION_STATUS_COLOR: Record<ApplicationStatus, string> = {
  DISCOVERED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  RESEARCHING: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  DRAFT_READY: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  AWAITING_APPROVAL: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  SCHEDULED: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  SENT: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  REPLIED: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  INTERVIEW: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  OFFER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  FAILED: "bg-red-500/15 text-red-300 border-red-500/30",
};

export const AGENTS: {
  name: AgentName;
  label: string;
  description: string;
  icon: string;
  accent: string;
}[] = [
  {
    name: "RESEARCH",
    label: "Research Agent",
    description: "Researches companies, career pages and public recruitment channels.",
    icon: "Globe",
    accent: "from-sky-500 to-indigo-500",
  },
  {
    name: "DISCOVERY",
    label: "Job Discovery Agent",
    description: "Finds matching vacancies across permitted job sources.",
    icon: "Search",
    accent: "from-cyan-500 to-blue-500",
  },
  {
    name: "CV_ANALYSIS",
    label: "CV Analysis Agent",
    description: "Structures the candidate's background, skills and achievements.",
    icon: "FileText",
    accent: "from-teal-500 to-emerald-500",
  },
  {
    name: "MATCHING",
    label: "Matching Agent",
    description: "Scores and ranks opportunities with explainable compatibility.",
    icon: "Target",
    accent: "from-amber-500 to-orange-500",
  },
  {
    name: "EMAIL",
    label: "Email Writing Agent",
    description: "Drafts concise, personalized recruitment emails.",
    icon: "Mail",
    accent: "from-violet-500 to-purple-500",
  },
  {
    name: "COVER_LETTER",
    label: "Cover Letter Agent",
    description: "Writes a unique motivation letter per company and position.",
    icon: "PenLine",
    accent: "from-fuchsia-500 to-pink-500",
  },
  {
    name: "AUTOMATION",
    label: "Automation Agent",
    description: "Coordinates approvals, scheduling, sending and retries.",
    icon: "Zap",
    accent: "from-indigo-500 to-violet-500",
  },
  {
    name: "FOLLOW_UP",
    label: "Follow-up Agent",
    description: "Drafts polite follow-ups when a recruiter has not replied.",
    icon: "Repeat",
    accent: "from-emerald-500 to-teal-500",
  },
];

export const AGENT_LABEL: Record<AgentName, string> = AGENTS.reduce(
  (acc, agent) => ({ ...acc, [agent.name]: agent.label }),
  {} as Record<AgentName, string>,
);

export const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;
export const SENIORITIES = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "MANAGER"] as const;
export const TONES = ["FORMAL", "PROFESSIONAL", "FRIENDLY", "CONCISE"] as const;
export const LETTER_STYLES = ["PROFESSIONAL", "STORYTELLING", "IMPACT", "ACADEMIC"] as const;
export const LANGUAGES = ["en", "fr"] as const;

export const JOB_SOURCES = [
  "LINKEDIN",
  "INDEED",
  "GREENHOUSE",
  "LEVER",
  "WTTJ",
  "CAREERS_PAGE",
  "MANUAL",
] as const;

export const SOURCE_LABEL: Record<(typeof JOB_SOURCES)[number], string> = {
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  WTTJ: "Welcome to the Jungle",
  CAREERS_PAGE: "Career page",
  MANUAL: "Manual",
};
