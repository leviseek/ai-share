import type { ButtonHTMLAttributes, ReactElement } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "ghost";

const buttonBaseClass = "rie-button";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  default: "rie-button-primary",
  ghost: "rie-button-ghost",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant = "default", ...props }: ButtonProps): ReactElement {
  return <button className={cn(buttonBaseClass, buttonVariantClasses[variant], className)} {...props} />;
}
