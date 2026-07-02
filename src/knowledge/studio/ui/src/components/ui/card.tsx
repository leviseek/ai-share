import type { HTMLAttributes, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-slate-950/60 text-slate-100 shadow-2xl shadow-sky-950/20",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div className={cn("p-4", className)} {...props} />;
}
