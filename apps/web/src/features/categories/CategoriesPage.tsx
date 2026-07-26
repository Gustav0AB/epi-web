import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryDto, CategoryImportResult, OrganizationDto } from "@epi/shared";
import { CATEGORY_CSV_COLUMNS } from "@epi/shared";
import { Badge, Button, Card, ConfirmModal, Dropdown, Label, Modal, Table, TextField } from "../../shared/components";
import type { Column, DropdownOption } from "../../shared/components";

const NEW_CATEGORY_VALUE = "__new__";

const textareaCls =
  "min-h-20 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
import { apiClient } from "../../lib/api-client";
import { useAuthStore } from "../../store/auth.store";
import { useI18n } from "../../lib/i18n";

// El endpoint de import espera Content-Type: text/csv (límite 1mb en el
// backend, distinto del límite JSON) — no puede pasar por apiClient.post.
// organizationId va en la query: system_admin la elige, org_admin la ignora
// (el backend siempre usa la suya para ese rol).
async function importCategoriesCsv(csv: string, organizationId: string): Promise<CategoryImportResult> {
  const token = useAuthStore.getState().token;
  const qs = organizationId ? `?organizationId=${organizationId}` : "";
  const res = await fetch(`/api/categories/import${qs}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: csv,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error.message);
  return json.data;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CategoriesPage() {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isSystemAdmin = currentUser?.role === "system_admin";

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");
  const [subcategoryText, setSubcategoryText] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [importOrgId, setImportOrgId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const [importResult, setImportResult] = useState<CategoryImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([
        apiClient.get<CategoryDto[]>("/api/categories"),
        isSystemAdmin ? apiClient.get<OrganizationDto[]>("/api/organizations") : Promise.resolve([]),
      ]);
      setCategories(c);
      setOrgs(o);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const orgOptions: DropdownOption[] = orgs.map((o) => ({ label: o.name, value: o.id }));

  // Nombres de categoría ya existentes (activos) para el dropdown — si el
  // nombre ya fue agregado antes, solo se elige y se agrega la subcategoría.
  const categoryNameOptions: DropdownOption[] = [
    { label: t("categories.newCategory"), value: NEW_CATEGORY_VALUE },
    ...[...new Set(categories.filter((c) => c.isActive).map((c) => c.name))].sort().map((n) => ({ label: n, value: n })),
  ];

  useEffect(() => {
    if (isSystemAdmin && orgs.length > 0 && !importOrgId) setImportOrgId(orgs[0]!.id);
  }, [isSystemAdmin, orgs, importOrgId]);

  function openCreate() {
    setEditing(null);
    setName(NEW_CATEGORY_VALUE);
    setNewName("");
    setSubcategoryText("");
    setOrganizationId(isSystemAdmin ? (orgs[0]?.id ?? "") : (currentUser?.organizationId ?? ""));
    setError(null);
    setModalOpen(true);
  }

  function openEdit(category: CategoryDto) {
    setEditing(category);
    setName(category.name);
    setNewName("");
    setSubcategoryText(category.subcategory ?? "");
    setOrganizationId(category.organizationId);
    setError(null);
    setModalOpen(true);
  }

  async function toggleActive(category: CategoryDto) {
    await apiClient.patch(`/api/categories/${category.id}`, { isActive: !category.isActive });
    await load();
  }

  async function handleSave() {
    const finalName = (name === NEW_CATEGORY_VALUE ? newName : name).trim();
    if (!finalName) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        // Edita una sola fila: una subcategoría (la primera línea, si hay varias).
        const subcategory = subcategoryText.split(/[\n,]/)[0]?.trim() || null;
        const body: Record<string, unknown> = { name: finalName, subcategory };
        if (isSystemAdmin) body.organizationId = organizationId || undefined;
        await apiClient.patch(`/api/categories/${editing.id}`, body);
      } else {
        // Alta: varias subcategorías (una por línea o separadas por coma) se
        // agregan todas de una — sin subcategoría, se agrega solo el nombre.
        const subcategories = [...new Set(subcategoryText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
        const body: Record<string, unknown> = { name: finalName };
        if (isSystemAdmin) body.organizationId = organizationId || undefined;
        for (const subcategory of subcategories.length ? subcategories : [null]) {
          await apiClient.post("/api/categories", { ...body, subcategory });
        }
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  function downloadCategoriesCsv() {
    const header = CATEGORY_CSV_COLUMNS.join(",");
    const lines = categories.length
      ? categories.map((c) => [csvCell(c.name), csvCell(c.subcategory ?? "")].join(","))
      : ["categoria 1,sub cat 1", "categoria 1,sub cat 2", "categoria 2,sub cat 1"];
    download("categorias.csv", [header, ...lines].join("\n"));
  }

  async function onCategoriesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSaving(true);
    setImportResult(null);
    try {
      const result = await importCategoriesCsv(await file.text(), importOrgId);
      setImportResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.categories.importError"));
    } finally {
      setImportSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const columns: Column<CategoryDto>[] = [
    { key: "name", header: t("scoring.table.category") },
    { key: "subcategory", header: t("scoring.table.subcategory"), render: (c) => c.subcategory ?? "—" },
    ...(isSystemAdmin
      ? [
          {
            key: "organizationId",
            header: t("createUserModal.organization"),
            render: (c: CategoryDto) => orgNameById.get(c.organizationId) ?? "—",
          } as Column<CategoryDto>,
        ]
      : []),
    {
      key: "isActive",
      header: t("common.status"),
      render: (c) => (
        <Badge color={c.isActive ? "green" : "red"}>{c.isActive ? t("common.active") : t("common.inactive")}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
            {t("common.edit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(c)}>
            {c.isActive ? t("common.deactivate") : t("common.activate")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}>
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label variant="title" className="block">{t("settings.categories.title")}</Label>
          <p className="mt-0.5 text-sm text-gray-500">{t("categories.subtitle")}</p>
        </div>
        <Button onClick={openCreate}>{t("categories.add")}</Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Table
        columns={columns}
        rows={categories}
        keyExtractor={(c) => c.id}
        loading={loading}
        emptyText={t("settings.categories.empty")}
        pageSize={25}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label variant="subtitle" className="block">{t("categories.csvTitle")}</Label>
          <div className="flex flex-wrap items-end gap-2">
            {isSystemAdmin && (
              <Dropdown
                label={t("createUserModal.organization")}
                options={orgOptions}
                value={importOrgId}
                onChange={setImportOrgId}
              />
            )}
            <Button variant="secondary" onClick={downloadCategoriesCsv}>
              {t("settings.categories.download")}
            </Button>
            <Button
              variant="secondary"
              loading={importSaving}
              disabled={isSystemAdmin && !importOrgId}
              onClick={() => fileRef.current?.click()}
            >
              {t("scoring.importCsv")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onCategoriesFile}
            />
          </div>
        </div>
        <p className="mt-1 text-sm text-gray-500">{t("settings.categories.note")}</p>
        {importResult && (
          <p className="mt-2 text-sm text-gray-700">
            {t("scoring.result.applied")}: <strong>{importResult.applied}</strong> ·{" "}
            {t("scoring.result.skipped")}: <strong>{importResult.skipped}</strong>
            {importResult.errors.length > 0 && (
              <span className="text-danger"> · {t("settings.categories.errors")}: {importResult.errors.length}</span>
            )}
          </p>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("categories.editTitle") : t("categories.addTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button loading={saving} onClick={handleSave}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {isSystemAdmin && (
            <Dropdown
              label={t("createUserModal.organization")}
              options={orgOptions}
              value={organizationId}
              onChange={setOrganizationId}
            />
          )}
          <Dropdown
            label={t("scoring.table.category")}
            options={categoryNameOptions}
            value={name}
            onChange={setName}
          />
          {name === NEW_CATEGORY_VALUE && (
            <TextField
              label={t("categories.newCategory")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("categories.newCategoryPlaceholder")}
            />
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t("scoring.table.subcategory")}</label>
            <textarea
              className={textareaCls}
              value={subcategoryText}
              onChange={(e) => setSubcategoryText(e.target.value)}
              placeholder={t("categories.subcategoriesPlaceholder")}
              rows={3}
            />
            {!editing && <p className="text-xs text-gray-500">{t("categories.subcategoriesHint")}</p>}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title={t("categories.deleteTitle")}
        message={t("categories.deleteMessage").replace("{name}", deleting?.name ?? "")}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await apiClient.delete(`/api/categories/${deleting!.id}`);
          await load();
        }}
      />
    </div>
  );
}
