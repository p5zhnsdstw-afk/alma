"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, useInView } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

const STAT_KEYS = ["stat1", "stat2", "stat3"] as const;

const STAGGER_DELAY = 0.15;

export function Problem() {
  const t = useTranslations("problem");
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section id="problem" ref={sectionRef} className="py-20 md:py-28 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STAT_KEYS.map((key, index) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{
                duration: 0.5,
                ease: "easeOut",
                delay: index * STAGGER_DELAY,
              }}
            >
              <Card className="border-none bg-white shadow-sm rounded-2xl text-center">
                <CardContent className="py-10 px-6">
                  <p className="text-4xl font-bold text-[#7A8060]">
                    {t(`${key}.value`)}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {t(`${key}.label`)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
