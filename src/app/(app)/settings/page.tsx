import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings · ApplyPilot AI",
  description: "Profile, targeting, automation rules, integrations and model backend.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
