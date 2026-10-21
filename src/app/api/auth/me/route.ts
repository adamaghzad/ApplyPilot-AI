import { optionalUser } from "@/lib/auth/session";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await optionalUser();
  return ok({
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
          plan: user.plan,
          onboardingCompleted: user.onboardingCompleted,
          onboardingStep: user.onboardingStep,
          demoMode: user.demoMode,
        }
      : null,
  });
}
