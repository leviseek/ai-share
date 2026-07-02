import type { ButtonHTMLAttributes, ReactElement } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "ghost";

const buttonBaseClass =
  "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-55";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  default: "bg-sky-500 text-white shadow-[0_0_24px_rgba(56,189,248,0.22)] hover:bg-sky-400",
  ghost: "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant = "default", ...props }: ButtonProps): ReactElement {
  return <button className={cn(buttonBaseClass, buttonVariantClasses[variant], className)} {...props} />;
}
