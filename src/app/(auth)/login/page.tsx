"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/logo";
import { AuroraBackground } from "@/components/shared/aurora";
import { api } from "@/lib/api-client";
import { signInSchema, type SignInInput } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(
    params.get("error") ? "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env, or use email and password." : null,
  );

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setError(null);
    try {
      const { user } = await api.post<{ user: { onboardingCompleted: boolean } }>("/api/auth/login", values);
      router.push(user.onboardingCompleted ? "/dashboard" : "/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  return (
    <div className="relative flex min-h-screen">
      <AuroraBackground className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-70" />

      <div className="flex w-full items-center justify-center px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex">
            <Logo />
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your automation command center.</p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />
              {form.formState.errors.email && <p className="text-xs text-rose-400">{form.formState.errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...form.register("password")} />
              {form.formState.errors.password && <p className="text-xs text-rose-400">{form.formState.errors.password.message}</p>}
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Sign in
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button asChild variant="outline" className="w-full" size="lg">
            <a href="/api/auth/google">
              <Mail className="h-4 w-4" />
              Continue with Google
            </a>
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>

          <div className="mt-8 flex items-start gap-2 rounded-lg border border-border/60 bg-card/50 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              ApplyPilot never sends an application without your explicit approval, and never invents contact details,
              experience or qualifications.
            </p>
          </div>
        </motion.div>
      </div>

      <div className="relative hidden w-1/2 overflow-hidden border-l border-border/60 bg-card/30 lg:block">
        <div className="pointer-events-none absolute inset-0 grid-pattern opacity-40" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <Sparkles className="h-6 w-6 text-brand-400" />
          <h2 className="mt-6 max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Eight agents work while you sleep. You keep the final word.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            {[
              "Research companies and public recruitment channels",
              "Discover and score matching vacancies",
              "Draft personalized emails and unique cover letters",
              "Send approved applications from your own mailbox",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
