import { useState } from "react";
import { Button, Dropdown, TextField } from "@epi/ui";
import type { CategoryDto } from "@epi/shared";
import { apiClient } from "../../lib/api-client";

export function SetupSubcategoryOther({ organizationId, siteId, categories, onCreate, onCancel }: { siteId: string; organizationId: string; categories: CategoryDto[]; onCreate: (category: CategoryDto) => void; onCancel: () => void }) {
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = [...new Set(categories.filter(item => item.isActive && item.organizationId === organizationId).map(item => item.name))].sort();
  async function save() {
    if (!category || !name.trim()) return;
    setSaving(true); setError(null);
    try { const created = await apiClient.post<CategoryDto>("/api/categories", { organizationId, name: category, subcategory: name.trim() }); await apiClient.put(`/api/categories/${encodeURIComponent(created.id)}/sites`, { siteIds: [siteId] }); onCreate({ ...created, siteIds: [siteId] }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la asignación. Si la subcategoría se creó, asígnale el sitio desde Categorías."); }
    finally { setSaving(false); }
  }
  return <div className="space-y-2 rounded border p-3">
    <Dropdown label="Categoría de la nueva subcategoría" value={category} options={[{ value: "", label: "Selecciona una categoría" }, ...names.map(value => ({ value, label: value }))]} onChange={setCategory} />
    <TextField label="Nueva subcategoría" value={name} maxLength={200} onChange={event => setName(event.target.value)} />
    {error && <p role="alert" className="text-danger">{error}</p>}
    <div className="flex gap-2"><Button size="sm" disabled={!category || !name.trim()} loading={saving} onClick={() => void save()}>Agregar y seleccionar</Button><Button size="sm" variant="secondary" disabled={saving} onClick={onCancel}>Cancelar</Button></div>
  </div>;
}
