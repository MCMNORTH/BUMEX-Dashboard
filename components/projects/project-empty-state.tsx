import Link from "next/link";
import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ProjectEmptyState() {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl animate-fade-up">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
          <FolderOpen className="size-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold tracking-[-0.04em]">No projects matched these filters</h3>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Adjust your search criteria or create a new project to start managing delivery execution.
          </p>
        </div>
        <Button asChild variant="secondary" className="rounded-full px-5">
          <Link href="/projects">View all projects</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
