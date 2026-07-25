import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SectionCardProps = {
  title?: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
};

export function SectionCard({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
}: SectionCardProps) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {title || description || eyebrow || actions ? (
        <CardHeader className={cn("relative space-y-1.5", headerClassName)}>
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              {eyebrow ? (
                <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  {eyebrow}
                </p>
              ) : null}
              {title ? <CardTitle className="text-lg">{title}</CardTitle> : null}
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div> : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={cn("relative", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
