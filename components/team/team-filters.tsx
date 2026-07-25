"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { TeamFilters as TeamFiltersType, TeamFiltersData } from "@/types/team";

export function TeamFilters({
  filters,
  filterData,
}: {
  filters: TeamFiltersType;
  filterData: TeamFiltersData;
}) {
  return (
    <form className="grid gap-3 rounded-[30px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.7fr_repeat(2,minmax(0,1fr))_auto] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder="Search a person, project, client, or active task"
          className="border-border/70 bg-background/55 pl-11 dark:border-white/10 dark:bg-slate-950/45"
        />
      </div>

      <ModernSelect
        name="role"
        defaultValue={filters.role ?? ""}
        placeholder="All roles"
        options={[
          { value: "", label: "All roles" },
          { value: "admin", label: "Admin" },
          { value: "manager", label: "Manager" },
          { value: "supervisor", label: "Supervisor" },
          { value: "employee", label: "Employee" },
          { value: "shareholder", label: "Shareholder" },
        ]}
      />

      <ModernSelect
        name="team"
        defaultValue={filters.teamId ?? ""}
        placeholder="All teams"
        options={[
          { value: "", label: "All teams" },
          ...filterData.teams.map((team) => ({ value: team.id, label: team.name })),
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">
          Apply
        </Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/team">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
