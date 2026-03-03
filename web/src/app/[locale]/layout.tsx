import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Nunito, Open_Sans, Quicksand } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";
import { AnalyticsProvider } from "@/components/analytics-provider";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  display: "swap",
});

const openSans = Open_Sans({
  variable: "--font-opensans",
  subsets: ["latin", "latin-ext"],
  weight: ["400"],
  display: "swap",
});

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin", "latin-ext"],
  weight: ["500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "alma — tu hogar, bajo control",
  description:
    "alma previene desastres domésticos, elimina el caos y distribuye la carga mental. Todo desde WhatsApp.",
  metadataBase: new URL("https://mialma.app"),
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "alma — tu hogar, bajo control",
    description:
      "El asistente inteligente para tu hogar. Previene desastres, coordina tu familia y vive en WhatsApp.",
    url: "https://mialma.app",
    siteName: "alma",
    locale: "es_EC",
    type: "website",
    images: [{ url: "/logo/og-logo.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "alma — tu hogar, bajo control",
    description:
      "El asistente inteligente para tu hogar. Todo desde WhatsApp.",
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  return (
    <html lang={locale} className="scroll-smooth">
      <body
        className={`${nunito.variable} ${openSans.variable} ${quicksand.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AnalyticsProvider />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
