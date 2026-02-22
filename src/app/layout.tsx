import type { Metadata } from "next";

import { FloatingFeedback } from "@/components/feedback/floating-feedback";
import { AppHeader } from "@/components/layout/app-header";

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
        <div className="min-h-screen">
          <AppHeader />
          <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-2 sm:px-6 lg:px-8">
            {children}
          </div>
        </div>
        <FloatingFeedback />
      </body>
    </html>
  );
}
