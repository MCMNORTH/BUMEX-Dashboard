import type { ReportSection as ReportSectionType } from "@/types/report";

export function ReportSection({ section }: { section: ReportSectionType }) {
  return (
    <div className="rounded-[24px] border border-border/65 bg-background/35 p-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{section.title}</p>
      </div>
      <div className="mt-4 space-y-2">
        {section.items.length ? (
          section.items.map((item, index) => (
            <p key={`${section.key}-${index}`} className="text-sm leading-6 text-foreground/90">
              {item}
            </p>
          ))
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">No notable items in this section.</p>
        )}
      </div>
    </div>
  );
}
