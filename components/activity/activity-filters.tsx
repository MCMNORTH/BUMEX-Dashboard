"use client";

import { ModernSelect } from "@/components/ui/modern-select";

type ActivityFilterValue = {
  entityType: string;
  actionType: string;
  userId: string;
  dateRange: string;
  scope: string;
};

export function ActivityFilters({
  value,
  onChange,
  entityTypes,
  actionTypes,
  users,
}: {
  value: ActivityFilterValue;
  onChange: (next: ActivityFilterValue) => void;
  entityTypes: string[];
  actionTypes: string[];
  users: Array<{ id: string; full_name: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <FilterSelect
        label="Entity"
        value={value.entityType}
        onChange={(entityType) => onChange({ ...value, entityType })}
        options={[{ value: "all", label: "All entities" }, ...entityTypes.map((item) => ({ value: item, label: item.replaceAll("_", " ") }))]}
      />
      <FilterSelect
        label="Action"
        value={value.actionType}
        onChange={(actionType) => onChange({ ...value, actionType })}
        options={[{ value: "all", label: "All actions" }, ...actionTypes.map((item) => ({ value: item, label: item.replaceAll("_", " ") }))]}
      />
      <FilterSelect
        label="User"
        value={value.userId}
        onChange={(userId) => onChange({ ...value, userId })}
        options={[{ value: "all", label: "All users" }, ...users.map((user) => ({ value: user.id, label: user.full_name }))]}
      />
      <FilterSelect
        label="Date range"
        value={value.dateRange}
        onChange={(dateRange) => onChange({ ...value, dateRange })}
        options={[
          { value: "all", label: "All dates" },
          { value: "today", label: "Today" },
          { value: "yesterday", label: "Yesterday" },
          { value: "last_7_days", label: "Last 7 days" },
          { value: "last_30_days", label: "Last 30 days" },
        ]}
      />
      <FilterSelect
        label="Project / client"
        value={value.scope}
        onChange={(scope) => onChange({ ...value, scope })}
        options={[
          { value: "all", label: "All scopes" },
          { value: "project", label: "Project" },
          { value: "client", label: "Client" },
        ]}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <ModernSelect
        name={`activity-filter-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        value={value}
        onValueChange={onChange}
        options={options}
      />
    </div>
  );
}
