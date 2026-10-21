import type { Metadata } from "next";

import { CvView } from "@/components/cv/cv-view";

export const metadata: Metadata = {
  title: "CV & profile · ApplyPilot AI",
  description: "Upload your CV and see exactly what ApplyPilot extracted from it.",
};

export default function CvPage() {
  return <CvView />;
}
