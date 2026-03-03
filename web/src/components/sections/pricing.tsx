"use client";

import { useRef } from "react";
import { useTranslations, useMessages } from "next-intl";
import { motion, useInView } from "framer-motion";
import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WhatsAppCTA } from "@/components/whatsapp-cta";
import { FundadorasCounter } from "@/components/fundadoras-counter";

const STAGGER_DELAY = 0.15;

interface PlanMessages {
  readonly name: string;
  readonly price: string;
  readonly period: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly popular?: string;
}

interface PricingMessages {
  readonly alma: PlanMessages;
  readonly familia: PlanMessages;
  readonly fundadoras: {
    readonly title: string;
    readonly description: string;
    readonly almaPrice: string;
    readonly familiaPrice: string;
    readonly forever: string;
  };
}

function PlanCard({
  plan,
  isPopular,
  section,
  ctaLabel,
}: {
  readonly plan: PlanMessages;
  readonly isPopular: boolean;
  readonly section: string;
  readonly ctaLabel: string;
}) {
  return (
    <Card
      className={`relative flex flex-col overflow-hidden rounded-2xl ${
        isPopular
          ? "border-2 border-olive shadow-lg bg-white"
          : "border-none shadow-sm bg-white"
      }`}
    >
      {isPopular && plan.popular && (
        <div className="absolute right-4 top-4">
          <Badge className="bg-[#7A8060] text-white hover:bg-[#7A8060]">
            {plan.popular}
          </Badge>
        </div>
      )}
      <CardContent className="flex flex-1 flex-col px-6 py-8">
        <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.description}
        </p>

        <div className="mt-6 flex items-baseline gap-1">
          <span className="text-4xl font-bold text-foreground">
            {plan.price}
          </span>
          <span className="text-muted-foreground">{plan.period}</span>
        </div>

        <ul className="mt-8 flex flex-1 flex-col gap-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#555A40]" />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <WhatsAppCTA
            section={section}
            plan={plan.name}
            variant={isPopular ? "primary" : "outline"}
            size="lg"
            className="w-full"
          >
            {ctaLabel}
          </WhatsAppCTA>
        </div>
      </CardContent>
    </Card>
  );
}

export function Pricing() {
  const t = useTranslations("pricing");
  const messages = useMessages() as { pricing: PricingMessages };
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  const almaFeatures = messages.pricing.alma.features;
  const familiaFeatures = messages.pricing.familia.features;

  const almaPlan: PlanMessages = {
    name: t("alma.name"),
    price: t("alma.price"),
    period: t("alma.period"),
    description: t("alma.description"),
    features: almaFeatures,
  };

  const familiaPlan: PlanMessages = {
    name: t("familia.name"),
    price: t("familia.price"),
    period: t("familia.period"),
    description: t("familia.description"),
    features: familiaFeatures,
    popular: t("familia.popular"),
  };

  return (
    <section id="pricing" ref={sectionRef} className="py-20 md:py-28 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={
              isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }
            }
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <PlanCard
              plan={almaPlan}
              isPopular={false}
              section="pricing"
              ctaLabel={t("cta")}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={
              isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }
            }
            transition={{
              duration: 0.5,
              ease: "easeOut",
              delay: STAGGER_DELAY,
            }}
          >
            <PlanCard
              plan={familiaPlan}
              isPopular={true}
              section="pricing"
              ctaLabel={t("cta")}
            />
          </motion.div>
        </div>

        <motion.div
          className="mx-auto mt-12 max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={
            isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
          }
          transition={{
            duration: 0.5,
            ease: "easeOut",
            delay: STAGGER_DELAY * 2,
          }}
        >
          <div className="rounded-2xl border border-[#7A8060]/20 bg-[#f8f8f5] px-6 py-8 text-center">
            <h3 className="text-xl font-bold text-foreground">
              {t("fundadoras.title")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("fundadoras.description")}
            </p>

            <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10">
              <div className="flex flex-col items-center">
                <span className="text-sm text-muted-foreground line-through">
                  {t("alma.price")}{t("alma.period")}
                </span>
                <span className="text-2xl font-bold text-[#7A8060]">
                  {t("fundadoras.almaPrice")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("alma.name")} — {t("fundadoras.forever")}
                </span>
              </div>

              <div className="hidden sm:block h-12 w-px bg-gray-200" />

              <div className="flex flex-col items-center">
                <span className="text-sm text-muted-foreground line-through">
                  {t("familia.price")}{t("familia.period")}
                </span>
                <span className="text-2xl font-bold text-[#7A8060]">
                  {t("fundadoras.familiaPrice")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("familia.name")} — {t("fundadoras.forever")}
                </span>
              </div>
            </div>

            <div className="mx-auto mt-6 max-w-sm">
              <FundadorasCounter />
            </div>
          </div>
        </motion.div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t("trial")}
        </p>
      </div>
    </section>
  );
}
