import type { CategoryDto } from "@epi/shared";

export function categoryOptions(categories: CategoryDto[], organizationId: string | null | undefined) {
  const active = organizationId ? categories.filter((category) => category.isActive && category.organizationId === organizationId) : [];
  const categoryNames = [...new Set(active.map((category) => category.name))].sort();
  const subcategoriesByCategory = new Map(categoryNames.map((name) => [name,
    [...new Set(active.filter((category) => category.name === name).flatMap((category) => category.subcategory ? [category.subcategory] : []))].sort(),
  ]));
  return { categoryNames, subcategoriesByCategory };
}

export function categorySelectionOptions(values: string[], current: string) {
  return [{ value: "", label: "Selecciona del catálogo" }, ...values.map(value => ({ value, label: value })), ...(current && !values.includes(current) ? [{ value: current, label: `${current} (fuera del catálogo activo)` }] : [])];
}

export function subcategoryChoices(categories: CategoryDto[], organizationId: string | null | undefined) {
  const choices = new Map<string, { value: string; category: string; subcategory: string }>();
  for (const item of categories) {
    if (!organizationId || !item.isActive || item.organizationId !== organizationId || !item.subcategory) continue;
    const value = JSON.stringify([item.name, item.subcategory]);
    choices.set(value, { value, category: item.name, subcategory: item.subcategory });
  }
  return [...choices.values()].sort((a, b) => a.subcategory.localeCompare(b.subcategory) || a.category.localeCompare(b.category));
}
