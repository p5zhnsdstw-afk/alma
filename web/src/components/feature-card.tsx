import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  className,
}: FeatureCardProps) {
  return (
    <Card
      className={cn(
        "border-none bg-white shadow-sm rounded-2xl transition-all duration-200 hover:-translate-y-1 hover:shadow-md",
        className,
      )}
    >
      <CardContent className="flex flex-col items-start gap-4 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-olive/10 text-olive">
          {icon}
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold text-olive-dark">{title}</h3>
          <p className="text-sm leading-relaxed text-gray-600">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
