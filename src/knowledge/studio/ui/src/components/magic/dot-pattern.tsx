import type { HTMLAttributes, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function DotPattern({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div aria-hidden="true" className={cn("rie-dot-pattern", className)} {...props} />;
}
