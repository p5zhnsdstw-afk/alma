"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, useInView } from "framer-motion";
import { Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STAT_KEYS = ["stat1", "stat2", "stat3"] as const;

const STAGGER_DELAY = 0.15;

function parseQuoteAndSource(raw: string) {
  const dashIndex = raw.lastIndexOf(" — ");
  if (dashIndex === -1) return { quote: raw, source: "" };
  return {
    quote: raw.slice(0, dashIndex),
    source: raw.slice(dashIndex + 3),
  };
}

export function SocialProof() {
  const t = useTranslations("socialProof");
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="social-proof"
      ref={sectionRef}
      className="bg-[#f8f8f5] py-20 md:py-28 px-4"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {t("title")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STAT_KEYS.map((key, index) => {
            const { quote, source } = parseQuoteAndSource(t(key));

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 30 }}
                animate={
                  isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }
                }
                transition={{
                  duration: 0.5,
                  ease: "easeOut",
                  delay: index * STAGGER_DELAY,
                }}
              >
                <Card className="h-full border-none bg-white shadow-sm rounded-2xl">
                  <CardContent className="flex flex-col gap-4 px-6 py-8">
                    <Quote className="h-6 w-6 text-[#7A8060] opacity-60" />
                    <p className="flex-1 text-sm leading-relaxed text-muted-foreground italic">
                      {quote}
                    </p>
                    {source && (
                      <p className="text-xs font-semibold text-[#555A40]">
                        {source}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
