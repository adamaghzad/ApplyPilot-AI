import { cn } from "@/lib/utils";

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 via-indigo-500 to-violetx-500 shadow-glow">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white" aria-hidden>
          <path d="M5 12.5 10.5 18 19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {showWordmark && (
        <span className="text-[15px] font-semibold tracking-tight">
          ApplyPilot<span className="gradient-text"> AI</span>
        </span>
      )}
    </span>
  );
}
