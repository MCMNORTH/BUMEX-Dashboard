"use client";

import { type ComponentProps } from "react";

import { EntityLogo } from "@/components/entities/entity-logo";
import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntity } from "@/hooks/use-entity";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

type EntitySwitcherProps = {
  className?: string;
  compact?: boolean;
} & Pick<ComponentProps<typeof Button>, "size">;

export function EntitySwitcher({ className, compact = false, size = "default" }: EntitySwitcherProps) {
  const { activeEntity } = useEntity();
  const { profile } = useUser();
  const { locale } = useI18n();

  if (!activeEntity || !profile) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        "justify-start gap-2 rounded-2xl border border-border bg-card px-3 text-left",
        compact ? "h-9 w-full max-w-none" : "h-10 max-w-[15rem]",
        className,
      )}
    >
      <EntityLogo entity={activeEntity} size="sm" />
      <div className={cn("min-w-0 text-left", !compact && "hidden md:block")}>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {locale === "fr" ? "Entité active" : "Active entity"}
        </p>
        <p className="truncate text-sm font-semibold">{activeEntity.name}</p>
      </div>
      <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
        {locale === "fr" ? "Fixe" : "Fixed"}
      </Badge>
    </Button>
  );
}
