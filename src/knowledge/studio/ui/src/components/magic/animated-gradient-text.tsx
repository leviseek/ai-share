import type { HTMLAttributes, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function AnimatedGradientText({ className, ...props }: HTMLAttributes<HTMLSpanElement>): ReactElement {
  return <span className={cn("rie-gradient-text", className)} {...props} />;
}
