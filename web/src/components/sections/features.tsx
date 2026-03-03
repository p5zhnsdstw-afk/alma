"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Send,
  Sun,
  Wrench,
  Users,
  Mic,
  MessageCircle,
  Brain,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";

const FEATURES = [
  { key: "delayedNudge", icon: Send },
  { key: "briefing", icon: Sun },
  { key: "maintenance", icon: Wrench },
  { key: "coordination", icon: Users },
  { key: "capture", icon: Mic },
  { key: "whatsapp", icon: MessageCircle },
  { key: "memory", icon: Brain },
] as const;

const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
} as const;

const HEADER_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
} as const;

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
} as const;

export function FeaturesSection() {
  const t = useTranslations("features");

  return (
    <section
      id="features"
      className="bg-white py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={CONTAINER_VARIANTS}
        >
          <motion.h2
            variants={HEADER_VARIANTS}
            className="text-center text-3xl font-bold text-[#555A40] md:text-4xl"
          >
            {t("title")}
          </motion.h2>

          <motion.p
            variants={HEADER_VARIANTS}
            className="mt-4 text-center text-lg text-[#555A40]/70"
          >
            {t("subtitle")}
          </motion.p>

          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <motion.div key={key} variants={CARD_VARIANTS}>
                <FeatureCard
                  icon={<Icon className="h-6 w-6" />}
                  title={t(`${key}.title`)}
                  description={t(`${key}.description`)}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
