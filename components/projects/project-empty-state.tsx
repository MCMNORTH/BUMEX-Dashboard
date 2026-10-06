import Link from "next/link";
import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ProjectEmptyState({ isFr, hasFilters }: { isFr: boolean; hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <FolderOpen className="size-6" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold">
            {hasFilters
              ? (isFr ? "Aucun projet ne correspond à ces filtres" : "No projects match these filters")
              : (isFr ? "Aucun projet pour le moment" : "No projects yet")}
          </h3>
          <p className="max-w-xl text-sm text-muted-foreground">
            {hasFilters
              ? (isFr ? "Essayez un autre filtre rapide ou effacez les filtres pour voir tous les projets." : "Try another quick filter or clear the filters to see every project.")
              : (isFr ? "Créez un projet pour commencer à suivre la livraison." : "Create a project to start tracking delivery.")}
          </p>
        </div>
        {hasFilters ? (
          <Button asChild variant="secondary">
            <Link href="/projects" scroll={false}>{isFr ? "Effacer les filtres" : "Clear filters"}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
