import type { Metadata } from "next";

import { AgentsView } from "@/components/agents/agents-view";

export const metadata: Metadata = {
  title: "AI agents · ApplyPilot AI",
  description: "Monitor the eight agents that research, discover, match, draft and follow up.",
};

export default function AgentsPage() {
  return <AgentsView />;
}
