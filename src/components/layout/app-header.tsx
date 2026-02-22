"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SessionControls } from "@/components/auth/session-controls";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="w-full px-4 pb-3 pt-6 sm:px-6 lg:px-10">
      <div className={`flex items-start gap-4 ${isHome ? "justify-end" : "justify-between"}`}>
        {!isHome ? (
          <Link href="/" className="text-xl font-semibold tracking-tight text-primary md:text-2xl">
            GovQuest
          </Link>
        ) : null}
        <div className="flex items-center gap-3">
          <SessionControls />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
