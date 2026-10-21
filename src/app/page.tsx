import { redirect } from "next/navigation";

import { optionalUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import {
  AgentsSection,
  CtaSection,
  FaqSection,
  FeaturesSection,
  HowItWorksSection,
  MetricsSection,
  PricingSection,
  SecuritySection,
  SiteFooter,
} from "@/components/landing/sections";

export default async function LandingPage() {
  const user = await optionalUser();
  if (user) {
    redirect(user.onboardingCompleted ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <MetricsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <AgentsSection />
        <SecuritySection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
