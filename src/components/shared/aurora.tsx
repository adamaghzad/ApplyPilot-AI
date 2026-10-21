export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-brand-500/25 blur-[120px] animate-aurora" />
      <div className="absolute -right-32 top-10 h-[30rem] w-[30rem] rounded-full bg-violetx-500/25 blur-[120px] animate-aurora [animation-delay:-6s]" />
      <div className="absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full bg-sky-400/20 blur-[120px] animate-aurora [animation-delay:-12s]" />
    </div>
  );
}
