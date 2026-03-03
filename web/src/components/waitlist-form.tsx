"use client";

import { useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

type FormStatus = "idle" | "submitting" | "success" | "error";

export function WaitlistForm() {
  const t = useTranslations("waitlist");
  const locale = useLocale();
  const [status, setStatus] = useState<FormStatus>("idle");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [familySize, setFamilySize] = useState("2");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");

    const params = new URLSearchParams(window.location.search);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          familySize: Number(familySize),
          locale,
          utmSource: params.get("utm_source") ?? undefined,
          utmMedium: params.get("utm_medium") ?? undefined,
          utmCampaign: params.get("utm_campaign") ?? undefined,
        }),
      });

      if (!response.ok) throw new Error("Request failed");

      setStatus("success");
      trackEvent("waitlist_submitted", { locale, familySize: Number(familySize) });
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl bg-olive/10 p-8 text-center">
        <p className="text-lg font-semibold text-olive-dark">{t("success")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <div>
        <label htmlFor="wl-name" className="mb-1 block text-sm font-medium">
          {t("name")}
        </label>
        <input
          id="wl-name"
          type="text"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-olive"
        />
      </div>

      <div>
        <label htmlFor="wl-phone" className="mb-1 block text-sm font-medium">
          {t("phone")}
        </label>
        <input
          id="wl-phone"
          type="tel"
          required
          placeholder="+593..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-olive"
        />
      </div>

      <div>
        <label htmlFor="wl-family" className="mb-1 block text-sm font-medium">
          {t("familySize")}
        </label>
        <select
          id="wl-family"
          value={familySize}
          onChange={(e) => setFamilySize(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-olive"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {status === "error" && (
        <p className="text-sm text-destructive">{t("error")}</p>
      )}

      <Button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-olive py-6 text-base font-semibold text-white hover:bg-olive-dark"
      >
        {status === "submitting" ? "..." : t("submit")}
      </Button>
    </form>
  );
}
