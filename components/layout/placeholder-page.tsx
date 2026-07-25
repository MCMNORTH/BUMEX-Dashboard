"use client";

import { Cuboid, PanelTopOpen, Sparkles } from "lucide-react";

import type { AppRouteKey } from "@/types/navigation";
import { useRole } from "@/hooks/use-role";
import { placeholderPages } from "@/data/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

type PlaceholderPageProps = {
  page: AppRouteKey;
};

export function PlaceholderPage({ page }: PlaceholderPageProps) {
  const content = placeholderPages[page];
  const role = useRole();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <EmptyState
          title={content.emptyTitle}
          description={content.emptyDescription}
          label={content.placeholderLabel}
          icon={PanelTopOpen}
        />

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base sm:text-lg">Placeholder module</CardTitle>
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                UI only
              </Badge>
            </div>
            <CardDescription>
              This reserved card defines the visual rhythm for future content blocks inside the{" "}
              {content.title.toLowerCase()} section.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <p className="text-sm font-medium">Empty-state composition</p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {role === "shareholder"
                    ? "This page keeps a polished read-only shell in place while strategic summaries and governance-level modules are deferred."
                    : role === "employee"
                      ? "This page keeps a polished personal-work shell in place while task lists, delivery details, and workflow modules are intentionally deferred."
                      : "The current page keeps a polished shell in place while data, tables, and workflows are intentionally deferred."}
                </p>
              </div>
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Cuboid className="size-4 text-primary" />
                  <p className="text-sm font-medium">Future content zone</p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Use this area for metrics, lists, tables, timelines, and action panels in future
                  parts of the project.
                </p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/45 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Section state</p>
                <p className="text-xs text-muted-foreground">
                  Navigation, spacing, and component language are ready.
                </p>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                Scalable base
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
