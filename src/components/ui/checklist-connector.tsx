import { cn } from "@/lib/utils";

type ConnectorTone = "default" | "in_progress" | "completed" | "optional" | "blocked";

interface ChecklistConnectorProps {
  isFirst: boolean;
  isLast: boolean;
  tone?: ConnectorTone;
  className?: string;
}

const NODE_TONE_CLASS: Record<ConnectorTone, string> = {
  default: "bg-border",
  in_progress: "bg-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.24)]",
  completed: "bg-green-500 shadow-[0_0_0_2px_rgba(34,197,94,0.22)]",
  optional: "bg-slate-400 shadow-[0_0_0_2px_rgba(148,163,184,0.22)]",
  blocked: "bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.24)]",
};

export function ChecklistConnector({
  isFirst,
  isLast,
  tone = "default",
  className,
}: ChecklistConnectorProps) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-6", className)}>
      {!isFirst ? <span className="absolute -top-2 left-3 h-10 w-px bg-border/80" /> : null}
      {!isLast ? <span className="absolute bottom-[-0.5rem] left-3 top-8 w-px bg-border/80" /> : null}
      <span className="absolute left-3 top-8 h-px w-3 bg-border/80" />
      <span
        className={cn(
          "absolute left-3 top-8 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
          NODE_TONE_CLASS[tone],
        )}
      />
    </div>
  );
}
