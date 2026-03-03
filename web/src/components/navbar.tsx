"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { cn } from "@/lib/utils";
import { BASE_PATH } from "@/lib/constants";
import Image from "next/image";

const NAV_LINKS = [
  { key: "features", href: "#features" },
  { key: "pricing", href: "#pricing" },
  { key: "faq", href: "#faq" },
] as const;

export function Navbar() {
  const t = useTranslations("nav");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleScroll = useCallback(() => {
    setIsScrolled(window.scrollY > 10);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const closeMobileMenu = () => setIsMobileOpen(false);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          isScrolled
            ? "border-b border-[#7A8060]/10 bg-[#f8f8f5]/80 backdrop-blur-md"
            : "bg-transparent"
        )}
      >
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={closeMobileMenu}
          >
            <Image src={`${BASE_PATH}/logo/logo.svg`} alt="alma" width={48} height={48} />
            <span className="font-heading text-3xl font-bold text-night">alma</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map(({ key, href }) => (
              <a
                key={key}
                href={href}
                className="text-sm font-medium text-[#555A40]/70 transition-colors hover:text-[#555A40]"
              >
                {t(key)}
              </a>
            ))}
          </div>

          {/* Desktop right side */}
          <div className="hidden items-center gap-3 md:flex">
            <LanguageToggle />
            <Button
              asChild
              className="rounded-full bg-[#7A8060] px-5 text-white hover:bg-[#7A8060]/90"
            >
              <a href="#pricing">{t("cta")}</a>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMobileOpen((prev) => !prev)}
            className="relative z-50 flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="Toggle menu"
            aria-expanded={isMobileOpen}
          >
            <div className="flex w-5 flex-col gap-1.5">
              <span
                className={cn(
                  "h-0.5 w-full rounded bg-[#555A40] transition-all duration-300",
                  isMobileOpen && "translate-y-2 rotate-45"
                )}
              />
              <span
                className={cn(
                  "h-0.5 w-full rounded bg-[#555A40] transition-all duration-300",
                  isMobileOpen && "opacity-0"
                )}
              />
              <span
                className={cn(
                  "h-0.5 w-full rounded bg-[#555A40] transition-all duration-300",
                  isMobileOpen && "-translate-y-2 -rotate-45"
                )}
              />
            </div>
          </button>
        </nav>
      </header>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 md:hidden",
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      {/* Mobile slide-out menu */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-72 bg-[#f8f8f5] px-6 pt-24 shadow-xl transition-transform duration-300 md:hidden",
          isMobileOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex flex-col gap-6">
          {NAV_LINKS.map(({ key, href }) => (
            <a
              key={key}
              href={href}
              onClick={closeMobileMenu}
              className="text-lg font-medium text-[#555A40]/80 transition-colors hover:text-[#555A40]"
            >
              {t(key)}
            </a>
          ))}

          <div className="my-2 h-px bg-[#7A8060]/10" />

          <LanguageToggle />

          <Button
            asChild
            className="w-full rounded-full bg-[#7A8060] text-white hover:bg-[#7A8060]/90"
          >
            <a href="#pricing" onClick={closeMobileMenu}>
              {t("cta")}
            </a>
          </Button>
        </div>
      </div>
    </>
  );
}
