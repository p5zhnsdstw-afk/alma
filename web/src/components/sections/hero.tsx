"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { WhatsAppCTA } from "@/components/whatsapp-cta";
import { FundadorasCounter } from "@/components/fundadoras-counter";
import { PhoneMockup } from "@/components/phone-mockup";

const TEXT_FADE_IN = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: "easeOut" } },
} as const;

const PHONE_SLIDE_UP = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut", delay: 0.2 } },
} as const;

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="py-20 md:py-32 px-4">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center gap-12 md:gap-16">
        <motion.div
          className="flex-1 flex flex-col items-center md:items-start text-center md:text-left"
          initial="hidden"
          animate="visible"
          variants={TEXT_FADE_IN}
        >
          <h1 className="text-4xl md:text-6xl font-bold text-foreground tracking-tight">
            {t("headline")}
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-xl">
            {t("subheadline")}
          </p>

          <div className="mt-8">
            <WhatsAppCTA section="hero" variant="primary" size="lg">
              {t("cta")}
            </WhatsAppCTA>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            {t("subCta")}
          </p>

          <div className="mt-6">
            <FundadorasCounter />
          </div>
        </motion.div>

        <motion.div
          className="flex-1 flex justify-center"
          initial="hidden"
          animate="visible"
          variants={PHONE_SLIDE_UP}
        >
          <PhoneMockup variant="briefing" />
        </motion.div>
      </div>
    </section>
  );
}
