"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, useInView } from "framer-motion";
import { WhatsAppCTA } from "@/components/whatsapp-cta";
import { FundadorasCounter } from "@/components/fundadoras-counter";

export function FinalCta() {
  const t = useTranslations("finalCta");
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="final-cta"
      ref={sectionRef}
      className="bg-[#7A8060] px-4 py-20 md:py-28"
    >
      <div className="mx-auto max-w-3xl text-center">
        <motion.h2
          className="text-3xl md:text-5xl font-bold text-white"
          initial={{ opacity: 0, y: 20 }}
          animate={
            isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {t("headline")}
        </motion.h2>

        <motion.p
          className="mt-4 text-lg text-white/80"
          initial={{ opacity: 0, y: 20 }}
          animate={
            isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        >
          {t("subheadline")}
        </motion.p>

        <motion.div
          className="mt-10"
          initial={{ opacity: 0, y: 20 }}
          animate={
            isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        >
          <WhatsAppCTA
            section="final-cta"
            variant="outline"
            size="lg"
            className="border-white bg-white text-[#7A8060] hover:bg-white/90 hover:text-[#7A8060] active:bg-white/80"
          >
            {t("cta")}
          </WhatsAppCTA>
        </motion.div>

        <motion.div
          className="mx-auto mt-8 max-w-xs"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
        >
          <FundadorasCounter
            variant="compact"
            className="[&_span]:text-white/80 [&_.bg-gray-100]:bg-white/20 [&_.bg-gray-400]:bg-white/40"
          />
        </motion.div>
      </div>
    </section>
  );
}
