import { Badge } from "@/components/ui/badge";
import type { NoteVisibility } from "@/types/note";

const visibilityLabels: Record<NoteVisibility, string> = {
  private: "Private",
  team: "Team",
  management: "Management",
  shareholders: "Shareholders",
};

const visibilityClasses: Record<NoteVisibility, string> = {
  private: "border-white/10 bg-white/5 text-slate-200",
  team: "border-sky-500/20 bg-sky-500/10 text-sky-100",
  management: "border-amber-500/20 bg-amber-500/10 text-amber-100",
  shareholders: "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
};

export function NoteVisibilityBadge({ visibility }: { visibility: NoteVisibility }) {
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${visibilityClasses[visibility]}`}>
      {visibilityLabels[visibility]}
    </Badge>
  );
}
