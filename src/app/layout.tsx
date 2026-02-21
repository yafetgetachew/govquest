import type { Metadata } from "next";
import Link from "next/link";

import { FloatingFeedback } from "@/components/feedback/floating-feedback";
import { SessionControls } from "@/components/auth/session-controls";
import { ThemeToggle } from "@/components/theme/theme-toggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "GovQuest",
  description: "Quest-style guides for Ethiopian government processes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-layout="balanced" data-contrast="normal" data-motion="full" suppressHydrationWarning>
      <body className="font-sans">
        <div className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-col gap-4 border-b border-border/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href="/" className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                GovQuest.et
              </Link>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <SessionControls />
              <div className="h-6 w-px bg-border/80" aria-hidden />
              <ThemeToggle />
            </div>
          </header>
          {children}
        </div>
        <FloatingFeedback />
      </body>
    </html>
  );
}
