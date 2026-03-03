"use client";

import { useTranslations } from "next-intl";
import { WaitlistForm } from "@/components/waitlist-form";

export function WaitlistSection() {
  const t = useTranslations("waitlist");

  return (
    <section id="waitlist" className="bg-stone px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="mb-2 text-3xl font-bold md:text-4xl">{t("title")}</h2>
        <p className="mb-8 text-muted-foreground">{t("subtitle")}</p>
        <WaitlistForm />
      </div>
    </section>
  );
}
