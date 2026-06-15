import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function StatCard({
  label, value, hint, delta, tone = "neutral", icon: Icon, glow,
}: {
  label: string; value: string; hint?: string;
  delta?: { v: string; up: boolean };
  tone?: "neutral" | "green" | "violet" | "amber";
  icon?: React.ComponentType<{ className?: string }>;
  glow?: boolean;
}) {
  const accent = {
    neutral: "text-chalk", green: "text-emerald", violet: "text-violet", amber: "text-amber",
  }[tone];
  return (
    <Card glow={glow} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-mist">{label}</span>
        {Icon && (
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg bg-ink-800", accent)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className={cn("font-mono text-[26px] font-600 leading-none tabnums", accent)}>{value}</div>
      <div className="flex items-center gap-2">
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium",
            delta.up ? "text-emerald" : "text-rose")}>
            {delta.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta.v}
          </span>
        )}
        {hint && <span className="text-xs text-mist">{hint}</span>}
      </div>
    </Card>
  );
}
