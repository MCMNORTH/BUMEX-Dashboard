import type { ModernSelectOption } from "@/components/ui/modern-select";
import { getBumexEntity } from "@/lib/entities/config";
import type { Locale } from "@/lib/i18n/config";
import type { BumexEntityCode } from "@/types/entity";

export type PickerPerson = {
  id: string;
  full_name: string;
  email?: string | null;
  job_title?: string | null;
  entity_code?: BumexEntityCode | null;
};

/** A project's entity, or its owner's for projects saved without one. */
export function projectHomeEntity(
  project: { entity_code?: BumexEntityCode | null } | null | undefined,
  owner: { entity_code?: BumexEntityCode | null } | null | undefined,
) {
  return project?.entity_code ?? owner?.entity_code ?? null;
}

/** Someone from another entity than the project's (unknown entities never count). */
export function isOutsidePerson(person: Pick<PickerPerson, "entity_code">, homeEntity: BumexEntityCode | null) {
  return Boolean(homeEntity && person.entity_code && person.entity_code !== homeEntity);
}

/**
 * People as picker options: the home entity's people first, under its name, then
 * everyone else under "Other entities" with their entity as a badge. Without a home
 * entity the list keeps its order and has no headings, as before.
 */
export function buildPeopleOptions(
  people: PickerPerson[],
  homeEntity: BumexEntityCode | null,
  locale: Locale,
): ModernSelectOption[] {
  const seen = new Set<string>();
  const unique = people.filter((person) => !seen.has(person.id) && Boolean(seen.add(person.id)));
  const toOption = (person: PickerPerson, group?: string): ModernSelectOption => ({
    value: person.id,
    label: person.full_name,
    group,
    badge: group && isOutsidePerson(person, homeEntity) ? getBumexEntity(person.entity_code)?.name : undefined,
    keywords: [person.email, person.job_title],
  });

  if (!homeEntity) {
    return unique.map((person) => toOption(person));
  }

  const homeGroup = getBumexEntity(homeEntity)?.name ?? homeEntity;
  const otherGroup = locale === "fr" ? "Autres entités" : "Other entities";
  const byName = (a: PickerPerson, b: PickerPerson) => a.full_name.localeCompare(b.full_name, locale);
  const home = unique.filter((person) => person.entity_code === homeEntity).sort(byName);
  const others = unique.filter((person) => person.entity_code !== homeEntity).sort(byName);

  return [...home.map((person) => toOption(person, homeGroup)), ...others.map((person) => toOption(person, otherGroup))];
}
