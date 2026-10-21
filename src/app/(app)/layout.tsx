import { redirect } from "next/navigation";

import { dbReady } from "@/lib/db";
import { optionalUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await dbReady();
  const user = await optionalUser();

  if (!user) redirect("/login");
  if (!user.onboardingCompleted) redirect("/onboarding");

  return (
    <AppShell userEmail={user.email} userName={user.name} demoMode={user.demoMode}>
      {children}
    </AppShell>
  );
}
