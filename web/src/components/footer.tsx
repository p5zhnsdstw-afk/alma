"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { BASE_PATH } from "@/lib/constants";

const CURRENT_YEAR = new Date().getFullYear();

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="bg-stone px-4 py-12 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-4">
          <Image src={`${BASE_PATH}/logo/logo.svg`} alt="alma" width={80} height={80} />
          <span className="font-heading text-5xl font-bold tracking-tight text-night">
            alma
          </span>
        </div>
        <p className="text-sm text-olive-dark/60">{t("tagline")}</p>

        <div className="flex gap-6 text-sm">
          <a
            href="#"
            className="text-olive-dark/50 transition-colors hover:text-olive-dark"
          >
            {t("privacy")}
          </a>
          <a
            href="#"
            className="text-olive-dark/50 transition-colors hover:text-olive-dark"
          >
            {t("terms")}
          </a>
        </div>

        <p className="text-xs text-olive-dark/40">
          {t("copyright", { year: CURRENT_YEAR })}
        </p>
      </div>
    </footer>
  );
}
