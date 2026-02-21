import * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indicatorClassName?: string;
}

export function Progress({
  value = 0,
  max = 100,
  className,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const safeMax = max <= 0 ? 100 : max;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(clamped)}
      className={cn(
        "relative h-4 w-full overflow-hidden border border-border bg-muted/75",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative h-full bg-[linear-gradient(90deg,hsl(var(--primary))_0%,hsl(var(--secondary))_100%)] transition-[width] duration-500 ease-out",
          indicatorClassName,
        )}
        style={{ width: `${percent}%` }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,hsl(var(--foreground)/0.14)_35%,transparent_65%)]" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/20 dark:ring-white/10"
      />
    </div>
  );
}
