"use client";

import { type ReactNode } from "react";
import { useLocale } from "next-intl";
import { trackCTAClick } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface WhatsAppCTAProps {
  readonly section: string;
  readonly plan?: string;
  readonly variant: "primary" | "outline";
  readonly size?: "default" | "lg";
  readonly className?: string;
  readonly children: ReactNode;
}

const VARIANT_STYLES = {
  primary:
    "bg-olive text-white hover:bg-olive-dark active:bg-night shadow-md hover:shadow-lg",
  outline:
    "border-2 border-olive text-olive hover:bg-olive/5 active:bg-olive/10",
} as const;

const SIZE_STYLES = {
  default: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
} as const;

export function WhatsAppCTA({
  section,
  plan,
  variant,
  size = "default",
  className,
  children,
}: WhatsAppCTAProps) {
  const locale = useLocale();

  const handleClick = () => {
    trackCTAClick(section, plan, locale);
  };

  return (
    <a
      href="#waitlist"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-olive/50 focus-visible:ring-offset-2",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
    >
      {children}
    </a>
  );
}
