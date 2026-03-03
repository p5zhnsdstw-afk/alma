"use client";

import { FUNDADORAS_REMAINING, FUNDADORAS_TOTAL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface FundadorasCounterProps {
  readonly variant?: "compact" | "full";
  readonly className?: string;
}

const URGENCY_THRESHOLD_RED = 10;
const URGENCY_THRESHOLD_AMBER = 20;

function resolveUrgencyColor(remaining: number) {
  if (remaining <= 0) return { bar: "bg-gray-400", text: "text-gray-500" };
  if (remaining < URGENCY_THRESHOLD_RED)
    return { bar: "bg-red-500", text: "text-red-600" };
  if (remaining <= URGENCY_THRESHOLD_AMBER)
    return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-olive-dark", text: "text-olive-dark" };
}

export function FundadorasCounter({
  variant = "full",
  className,
}: FundadorasCounterProps) {
  const remaining = FUNDADORAS_REMAINING;
  const total = FUNDADORAS_TOTAL;
  const filled = total - remaining;
  const progressPercent = (filled / total) * 100;
  const colors = resolveUrgencyColor(remaining);
  const isSoldOut = remaining <= 0;

  if (variant === "compact") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className="flex items-center justify-between text-xs font-medium">
          <span className={colors.text}>
            {isSoldOut ? "Agotados" : `Quedan ${remaining} cupos`}
          </span>
          <span className="text-gray-400">
            {filled}/{total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <motion.div
            className={cn("h-full rounded-full", colors.bar)}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-olive/10 bg-white/60 px-6 py-4 backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          {isSoldOut ? (
            <span className="text-lg font-bold text-gray-500">Agotados</span>
          ) : (
            <>
              <span className="text-sm text-gray-600">Quedan</span>
              <motion.span
                className={cn("text-2xl font-bold tabular-nums", colors.text)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                {remaining}
              </motion.span>
              <span className="text-sm text-gray-600">cupos</span>
            </>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {filled} de {total} tomados
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className={cn("h-full rounded-full", colors.bar)}
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
