import { Badge } from "@/components/ui/badge";
import type { NoteVisibility } from "@/types/note";
import { toneBadge } from "@/components/ui/tone";

const visibilityLabels: Record<NoteVisibility, string> = {
  private: "Private",
  team: "Team",
  management: "Management",
  shareholders: "Shareholders",
};

const visibilityClasses: Record<NoteVisibility, string> = {
  private: toneBadge.neutral,
  team: toneBadge.neutral,
  management: toneBadge.neutral,
  shareholders: toneBadge.neutral,
};

export function NoteVisibilityBadge({ visibility }: { visibility: NoteVisibility }) {
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${visibilityClasses[visibility]}`}>
      {visibilityLabels[visibility]}
    </Badge>
  );
}
