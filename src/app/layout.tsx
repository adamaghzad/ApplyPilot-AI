import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "ApplyPilot AI — Autonomous AI agents for your job search",
    template: "%s · ApplyPilot AI",
  },
  description:
    "Upload your CV once. ApplyPilot AI researches companies, discovers matching jobs, drafts personalized emails and cover letters, and sends approved applications from your own mailbox.",
  keywords: [
    "AI job application",
    "job search automation",
    "AI cover letter",
    "recruitment email generator",
    "job discovery agent",
    "application tracker",
  ],
  openGraph: {
    title: "ApplyPilot AI — Autonomous AI agents for your job search",
    description:
      "Eight specialized AI agents research, discover, match, draft and send your job applications — with you in control of every send.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080c1a" },
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                classNames: {
                  toast: "border-border bg-card text-card-foreground",
                  description: "text-muted-foreground",
                },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
