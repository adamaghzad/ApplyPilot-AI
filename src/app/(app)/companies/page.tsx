import type { Metadata } from "next";

import { CompaniesView } from "@/components/companies/companies-view";

export const metadata: Metadata = {
  title: "Companies · ApplyPilot AI",
  description: "Research target companies and collect publicly sourced recruitment contacts with full provenance.",
};

export default function CompaniesPage() {
  return <CompaniesView />;
}
