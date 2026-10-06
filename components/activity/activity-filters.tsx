"use client";

import { useI18n } from "@/components/layout/i18n-provider";
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
  const { locale } = useI18n();
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <FilterSelect
        label={tr("Élément", "Record type")}
        value={value.entityType}
        onChange={(entityType) => onChange({ ...value, entityType })}
        options={[{ value: "all", label: tr("Tous les éléments", "All record types") }, ...entityTypes.map((item) => ({ value: item, label: item.replaceAll("_", " ") }))]}
      />
      <FilterSelect
        label={tr("Action", "Action")}
        value={value.actionType}
        onChange={(actionType) => onChange({ ...value, actionType })}
        options={[{ value: "all", label: tr("Toutes les actions", "All actions") }, ...actionTypes.map((item) => ({ value: item, label: item.replaceAll("_", " ") }))]}
      />
      <FilterSelect
        label={tr("Utilisateur", "User")}
        value={value.userId}
        onChange={(userId) => onChange({ ...value, userId })}
        options={[{ value: "all", label: tr("Tous les utilisateurs", "All users") }, ...users.map((user) => ({ value: user.id, label: user.full_name }))]}
      />
      <FilterSelect
        label={tr("Période", "Date range")}
        value={value.dateRange}
        onChange={(dateRange) => onChange({ ...value, dateRange })}
        options={[
          { value: "all", label: tr("Toutes les dates", "All dates") },
          { value: "today", label: tr("Aujourd’hui", "Today") },
          { value: "yesterday", label: tr("Hier", "Yesterday") },
          { value: "last_7_days", label: tr("7 derniers jours", "Last 7 days") },
          { value: "last_30_days", label: tr("30 derniers jours", "Last 30 days") },
        ]}
      />
      <FilterSelect
        label={tr("Projet / client", "Project / client")}
        value={value.scope}
        onChange={(scope) => onChange({ ...value, scope })}
        options={[
          { value: "all", label: tr("Tous", "All") },
          { value: "project", label: tr("Projet", "Project") },
          { value: "client", label: tr("Client", "Client") },
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
