"use client";

import { useTranslations, useMessages } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqQuestion {
  readonly q: string;
  readonly a: string;
}

interface FaqMessages {
  readonly faq: {
    readonly title: string;
    readonly questions: readonly FaqQuestion[];
  };
}

export function Faq() {
  const t = useTranslations("faq");
  const messages = useMessages() as FaqMessages;
  const questions = messages.faq.questions;

  return (
    <section id="faq" className="py-20 md:py-28 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {t("title")}
          </h2>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {questions.map((item, index) => (
            <AccordionItem key={index} value={`faq-${index}`}>
              <AccordionTrigger className="text-base text-left font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
