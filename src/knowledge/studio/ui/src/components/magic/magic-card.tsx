import type { HTMLAttributes, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function MagicCard({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div className={cn("magic-card", className)} {...props} />;
}
