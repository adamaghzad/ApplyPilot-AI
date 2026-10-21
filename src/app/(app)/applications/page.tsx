import type { Metadata } from "next";

import { ApplicationsBoard } from "@/components/applications/applications-board";

export const metadata: Metadata = {
  title: "Applications · ApplyPilot AI",
  description: "Review, approve and track every application across the full pipeline.",
};

export default function ApplicationsPage() {
  return <ApplicationsBoard />;
}
