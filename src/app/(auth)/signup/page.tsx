"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/logo";
import { AuroraBackground } from "@/components/shared/aurora";
import { api } from "@/lib/api-client";
import { signUpSchema, type SignUpInput } from "@/lib/validation";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", locale: "en" },
  });

  async function onSubmit(values: SignUpInput) {
    setError(null);
    try {
      await api.post("/api/auth/signup", values);
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <AuroraBackground className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-70" />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex">
          <Logo />
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Free to start. No card required.</p>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" autoComplete="name" placeholder="Amine Berrada" {...form.register("name")} />
            {form.formState.errors.name && <p className="text-xs text-rose-400">{form.formState.errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />
            {form.formState.errors.email && <p className="text-xs text-rose-400">{form.formState.errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" placeholder="At least 8 characters, with a number" {...form.register("password")} />
            {form.formState.errors.password && <p className="text-xs text-rose-400">{form.formState.errors.password.message}</p>}
          </div>

          {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}

          <Button type="submit" className="w-full" size="lg" variant="glow" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Create account
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
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
