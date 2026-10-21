import type { Metadata } from "next";

import { JobsView } from "@/components/jobs/jobs-view";

export const metadata: Metadata = {
  title: "Job discovery · ApplyPilot AI",
  description: "Discover and score job listings across public boards and career pages.",
};

export default function JobsPage() {
  return <JobsView />;
}
