"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

interface ProcessBackButtonProps {
  ariaLabel?: string;
  className?: string;
  fallbackHref?: string;
}

export function ProcessBackButton({
  ariaLabel = "Back",
  className,
  fallbackHref = "/",
}: ProcessBackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window === "undefined") {
      router.push(fallbackHref);
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className={cn("inline-flex items-center justify-center text-foreground", className)}
    >
      <ArrowLeft className="h-6 w-6" />
    </button>
  );
}
