"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { PhoneMockup } from "@/components/phone-mockup";

const STEP_KEYS = ["step1", "step2", "step3"] as const;

const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.2 },
  },
} as const;

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
} as const;

const MOCKUP_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: "easeOut", delay: 0.6 },
  },
} as const;

export function SolutionSection() {
  const t = useTranslations("solution");

  return (
    <section
      id="solution"
      className="bg-[#f8f8f5] py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={CONTAINER_VARIANTS}
          className="flex flex-col items-center"
        >
          <motion.h2
            variants={ITEM_VARIANTS}
            className="text-center text-3xl font-bold text-[#555A40] md:text-4xl"
          >
            {t("title")}
          </motion.h2>

          <motion.p
            variants={ITEM_VARIANTS}
            className="mt-4 text-center text-lg text-[#555A40]/70"
          >
            {t("subtitle")}
          </motion.p>

          <div className="relative mt-16 grid w-full grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
            {/* Connecting line between steps (desktop only) */}
            <div
              className="pointer-events-none absolute top-8 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] hidden h-0.5 bg-[#7A8060]/20 md:block"
              aria-hidden="true"
            />

            {STEP_KEYS.map((key, index) => (
              <motion.div
                key={key}
                variants={ITEM_VARIANTS}
                className="relative flex flex-col items-center text-center"
              >
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[#7A8060] text-xl font-bold text-white shadow-md">
                  {index + 1}
                </div>

                <h3 className="mt-5 text-lg font-bold text-[#555A40]">
                  {t(`${key}.title`)}
                </h3>

                <p className="mt-2 max-w-xs text-sm text-[#555A40]/60">
                  {t(`${key}.description`)}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            variants={MOCKUP_VARIANTS}
            className="mt-16 flex justify-center"
          >
            <PhoneMockup variant="nudge" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
