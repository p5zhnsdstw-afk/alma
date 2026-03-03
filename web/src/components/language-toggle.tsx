"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const LOCALES = ["es", "en"] as const;

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className="flex items-center rounded-full border border-olive/20 bg-white/80 p-0.5 text-xs font-semibold">
      {LOCALES.map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          className={cn(
            "rounded-full px-2.5 py-1 uppercase transition-colors",
            loc === locale
              ? "bg-olive text-white"
              : "text-olive-dark hover:bg-olive/10"
          )}
          aria-label={`Switch to ${loc === "es" ? "Spanish" : "English"}`}
          aria-pressed={loc === locale}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
