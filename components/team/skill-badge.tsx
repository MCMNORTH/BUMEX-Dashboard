import { Badge } from "@/components/ui/badge";

export function SkillBadge({ skill }: { skill: string }) {
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1">
      {skill}
    </Badge>
  );
}
