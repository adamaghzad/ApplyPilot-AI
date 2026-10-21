"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bell,
  Bot,
  Building2,
  ChevronLeft,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  Search,
  Settings,
  Sparkles,
  UserCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";
import { useRealtime } from "@/hooks/use-realtime";
import { cn, timeAgo } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/jobs", label: "Job discovery", icon: Search },
  { href: "/applications", label: "Applications", icon: KanbanSquare },
  { href: "/agents", label: "AI agents", icon: Bot },
  { href: "/cv", label: "CV & profile", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, userEmail, userName, demoMode }: { children: React.ReactNode; userEmail: string; userName?: string | null; demoMode: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { connected } = useRealtime(true);

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: { id: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string }[] }>("/api/notifications"),
    refetchInterval: 45_000,
  });

  const unread = notifications.data?.notifications.filter((n) => !n.readAt).length ?? 0;

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function signOut() {
    await api.post("/api/auth/logout");
    router.push("/");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/dashboard" className="focus-ring rounded-lg">
          <Logo showWordmark={!collapsed} />
        </Link>
        <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={() => setCollapsed((v) => !v)} aria-label="Toggle sidebar">
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <TooltipProvider key={item.href} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {active && <motion.span layoutId="nav-active" className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />}
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="lg:hidden">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        {demoMode && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-[11px] font-medium text-amber-300">Demo data</p>
            <p className="mt-1 text-[11px] leading-snug text-amber-200/70">
              Loaded for exploration. Clear it in Settings → Data before real applications.
            </p>
          </div>
        )}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-slate-500")} />
            <span className="text-[11px] font-medium">{connected ? "Live updates on" : "Connecting…"}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Server-sent events stream agent activity in real time.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-border/60 bg-card/40 backdrop-blur-xl transition-[width] duration-300 lg:block",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
            className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border/60 bg-card lg:hidden"
          >
            {sidebar}
          </motion.aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1" />

          <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex">
            <Radio className={cn("h-3 w-3", connected ? "text-emerald-400" : "text-muted-foreground")} />
            {connected ? "Live" : "Offline"}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-80 overflow-y-auto">
                {(notifications.data?.notifications ?? []).length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing new yet.</p>
                )}
                {(notifications.data?.notifications ?? []).slice(0, 8).map((notification) => (
                  <DropdownMenuItem
                    key={notification.id}
                    className="flex flex-col items-start gap-1 py-2"
                    onClick={() => {
                      api.post("/api/notifications", { id: notification.id });
                      if (notification.href) router.push(notification.href);
                    }}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="text-xs font-medium">{notification.title}</span>
                      {!notification.readAt && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
                    </span>
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">{notification.body}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(notification.createdAt)}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu">
                <UserCircle2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block truncate text-xs font-medium">{userName ?? "Account"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{userEmail}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/cv">
                  <Sparkles className="h-4 w-4" />
                  CV & profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
