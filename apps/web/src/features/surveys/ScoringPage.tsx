import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CategoryDto,
  QuestionTypeValue,
  QuestionWithWeight,
  ReprocessPendingResult,
  SurveyDefinitionDto,
  WeightImportResult,
} from "@epi/shared";
import { QUESTION_TYPES, WEIGHT_CSV_COLUMNS } from "@epi/shared";
import { Button, Card, Dropdown, Label, Modal, Table, TextField } from "../../shared/components";
import type { Column, DropdownOption } from "../../shared/components";
import { surveyApi } from "./api";
import { useAuthStore } from "../../store/auth.store";
import { UnregisteredForms } from "./UnregisteredForms";
import { JotformFormsCatalog } from "./JotformFormsCatalog";
import { useI18n } from "../../lib/i18n";

const QUESTION_TYPE_OPTIONS: DropdownOption[] = QUESTION_TYPES.map((t) => ({ label: t, value: t }));

type Edit = { category: string; subcategory: string; maxScore: string; correctAnswer: string };

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function editFromWeight(q: QuestionWithWeight): Edit {
  return {
    category: q.weight?.category ?? "",
    subcategory: q.weight?.subcategory ?? "",
    maxScore: q.weight?.maxScore != null ? String(q.weight.maxScore) : "",
    correctAnswer: q.weight?.correctAnswer ?? "",
  };
}

export function ScoringPage() {
  const { t } = useI18n();
  const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [questions, setQuestions] = useState<QuestionWithWeight[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<WeightImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [likertModalOpen, setLikertModalOpen] = useState(false);
  const [likertMax, setLikertMax] = useState("1");
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<ReprocessPendingResult | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const role = useAuthStore((s) => s.currentUser?.role);
  const isAdmin = role === "system_admin" || role === "org_admin";

  const loadDefinitions = useCallback(() => {
    void surveyApi.definitions().then(setDefinitions).catch(() => {});
  }, []);

  useEffect(() => {
    loadDefinitions();
  }, [loadDefinitions]);

  async function reprocessPending() {
    if (!selectedId) return;
    setReprocessing(true);
    setReprocessResult(null);
    try {
      setReprocessResult(await surveyApi.reprocessPending(selectedId));
      await loadQuestions(selectedId);
    } finally {
      setReprocessing(false);
    }
  }

  async function changeType(q: QuestionWithWeight, type: string) {
    await surveyApi.updateQuestion(q.id, { type: type as QuestionTypeValue });
    await loadQuestions(selectedId);
  }

  const loadQuestions = useCallback(async (defId: string) => {
    if (!defId) return;
    setLoading(true);
    try {
      // OPEN_TEXT no se pondera — viven en la página de Preguntas abiertas.
      const qs = (await surveyApi.questions(defId)).filter((q) => q.type !== "OPEN_TEXT");
      setQuestions(qs);
      setEdits(Object.fromEntries(qs.map((q) => [q.id, editFromWeight(q)])));
    } finally {
      setLoading(false);
    }
  }, []);

  function selectDefinition(id: string) {
    setSelectedId(id);
    setImportResult(null);
    setImportError(null);
    void loadQuestions(id);
    const organizationId = definitions.find((d) => d.id === id)?.organizationId;
    if (organizationId) void surveyApi.categories(organizationId).then(setCategories);
    else setCategories([]);
  }

  const setEdit = (id: string, patch: Partial<Edit>) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id]!, ...patch } }));

  function weightInputFor(e: Edit) {
    return {
      category: e.category,
      subcategory: e.subcategory || null,
      maxScore: Number(e.maxScore),
      correctAnswer: e.correctAnswer || null,
    };
  }

  async function save(q: QuestionWithWeight) {
    setSavingId(q.id);
    try {
      await surveyApi.setWeight(q.id, weightInputFor(edits[q.id]!));
      await loadQuestions(selectedId);
    } finally {
      setSavingId(null);
    }
  }

  // Guarda todas las filas con una categoría y un puntaje máximo válidos —
  // las incompletas se dejan para el flujo individual, sin bloquear el resto.
  async function saveAll() {
    setSavingAll(true);
    try {
      const ready = questions.filter((q) => {
        const e = edits[q.id];
        return e && e.category.trim() !== "" && e.maxScore.trim() !== "" && Number(e.maxScore) >= 0;
      });
      for (const q of ready) {
        await surveyApi.setWeight(q.id, weightInputFor(edits[q.id]!));
      }
      await loadQuestions(selectedId);
    } finally {
      setSavingAll(false);
    }
  }

  // Escalas (LIKERT/FREQUENCY): se les puede prellenar un puntaje máximo
  // común para que en el CSV solo quede pendiente lo demás.
  const isScale = (q: QuestionWithWeight) => q.type === "LIKERT" || q.type === "FREQUENCY";

  function downloadTemplate(scaleMax?: number) {
    const header = WEIGHT_CSV_COLUMNS.join(",");
    const lines = questions.map((q) =>
      [
        q.externalId,
        csvCell(q.text),
        q.type,
        csvCell(q.weight?.category ?? ""),
        csvCell(q.weight?.subcategory ?? ""),
        q.weight?.maxScore ?? (scaleMax !== undefined && isScale(q) ? scaleMax : ""),
        csvCell(q.weight?.correctAnswer ?? ""),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponderaciones-${selectedId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Al descargar: si hay preguntas de escala sin ponderar, preguntar si se
  // les asigna un puntaje máximo automáticamente.
  function onDownloadClick() {
    if (questions.some((q) => isScale(q) && !q.weight)) setLikertModalOpen(true);
    else downloadTemplate();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await surveyApi.importWeights(selectedId, await file.text());
      setImportResult(result);
      await loadQuestions(selectedId);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("scoring.importErrorGeneric"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const definitionOptions: DropdownOption[] = [
    { label: t("scoring.selectPlaceholder"), value: "" },
    ...definitions.map((d) => ({ label: d.title, value: d.id })),
  ];

  // Nombres de categoría activos del catálogo de esta organización, y sus
  // subcategorías agrupadas por nombre — para los dropdowns de la tabla.
  const activeCategories = categories.filter((c) => c.isActive);
  const categoryNames = [...new Set(activeCategories.map((c) => c.name))].sort();
  const subcategoriesByCategory = new Map<string, string[]>();
  for (const c of activeCategories) {
    if (!c.subcategory) continue;
    const list = subcategoriesByCategory.get(c.name) ?? [];
    list.push(c.subcategory);
    subcategoriesByCategory.set(c.name, list);
  }

  const columns: Column<QuestionWithWeight>[] = [
    {
      key: "question",
      header: t("scoring.table.question"),
      render: (q) => (
        <div>
          <span className="font-mono text-xs text-gray-400">{q.externalId}</span>
          <p className="text-gray-800">{q.text}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: t("scoring.table.type"),
      render: (q) => (
        <select
          className={inputCls}
          value={q.type}
          onChange={(e) => void changeType(q, e.target.value)}
        >
          {QUESTION_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "category",
      header: t("scoring.table.category"),
      render: (q) => {
        const current = edits[q.id]?.category ?? "";
        // Un valor ya guardado que no está en el catálogo (dato viejo, en
        // texto libre) se conserva como opción extra en vez de desaparecer.
        const options = current && !categoryNames.includes(current) ? [current, ...categoryNames] : categoryNames;
        return (
          <select
            className={inputCls}
            value={current}
            onChange={(e) => setEdit(q.id, { category: e.target.value, subcategory: "" })}
          >
            <option value="" disabled>
              {t("scoring.table.selectPlaceholder")}
            </option>
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "subcategory",
      header: t("scoring.table.subcategory"),
      render: (q) => {
        const current = edits[q.id]?.subcategory ?? "";
        const forCategory = subcategoriesByCategory.get(edits[q.id]?.category ?? "") ?? [];
        const options = current && !forCategory.includes(current) ? [current, ...forCategory] : forCategory;
        return (
          <select
            className={inputCls}
            value={current}
            onChange={(e) => setEdit(q.id, { subcategory: e.target.value })}
            disabled={options.length === 0}
          >
            <option value="">—</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "maxScore",
      header: t("scoring.table.maxScore"),
      render: (q) => (
        <input
          type="number"
          min={0}
          className={inputCls}
          value={edits[q.id]?.maxScore ?? ""}
          onChange={(e) => setEdit(q.id, { maxScore: e.target.value })}
        />
      ),
    },
    {
      key: "correctAnswer",
      header: t("scoring.table.correctAnswer"),
      render: (q) => {
        if (q.type !== "ONE_ANSWER") return <span className="text-xs text-gray-300">—</span>;
        const current = edits[q.id]?.correctAnswer ?? "";
        // Preguntas registradas antes de capturar `options` no tienen de
        // dónde armar el dropdown — se cae a texto libre para esas.
        if (q.options.length === 0) {
          return (
            <input
              className={inputCls}
              value={current}
              onChange={(e) => setEdit(q.id, { correctAnswer: e.target.value })}
            />
          );
        }
        const options = current && !q.options.includes(current) ? [current, ...q.options] : q.options;
        return (
          <select
            className={inputCls}
            value={current}
            onChange={(e) => setEdit(q.id, { correctAnswer: e.target.value })}
          >
            <option value="" disabled>
              {t("scoring.table.selectPlaceholder")}
            </option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (q) => (
        <Button size="sm" loading={savingId === q.id} onClick={() => save(q)}>
          {t("scoring.table.save")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">
          {t("scoring.title")}
        </Label>
        <p className="mt-0.5 text-sm text-gray-500">
          {t("scoring.subtitle")}
        </p>
      </div>

      {isAdmin && <JotformFormsCatalog onRegistered={loadDefinitions} />}
      {isAdmin && <UnregisteredForms onRegistered={loadDefinitions} />}

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64">
            <Dropdown
              label={t("scoring.selectSurvey")}
              options={definitionOptions}
              value={selectedId}
              onChange={selectDefinition}
            />
          </div>
          {selectedId && (
            <>
              <Button variant="secondary" onClick={onDownloadClick} disabled={!questions.length}>
                {t("scoring.downloadTemplate")}
              </Button>
              <Button
                variant="secondary"
                loading={importing}
                onClick={() => fileRef.current?.click()}
              >
                {t("scoring.importCsv")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFile}
              />
              <Button variant="secondary" loading={reprocessing} onClick={reprocessPending}>
                {t("scoring.reprocessPending")}
              </Button>
              <Button loading={savingAll} disabled={!questions.length} onClick={saveAll}>
                {t("scoring.saveAll")}
              </Button>
            </>
          )}
        </div>

        {reprocessResult && (
          <p className="mt-3 text-sm text-gray-700">
            {t("scoring.result.reprocessed")}: <strong>{reprocessResult.reprocessed}</strong> ·{" "}
            {t("scoring.result.stillPending")}: <strong>{reprocessResult.stillPending}</strong> ·{" "}
            {t("scoring.result.withError")}: <strong>{reprocessResult.errors}</strong>
          </p>
        )}

        {importError && <p className="mt-3 text-sm text-danger">{importError}</p>}
        {importResult && (
          <div className="mt-3 text-sm">
            <p className="text-gray-700">
              {t("scoring.result.applied")}: <strong>{importResult.applied}</strong> ·{" "}
              {t("scoring.result.skipped")}: <strong>{importResult.skipped}</strong>
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-danger">
                {importResult.errors.map((e) => (
                  <li key={e.row}>
                    {t("scoring.result.row")} {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {selectedId && (
        <Table
          columns={columns}
          rows={questions}
          keyExtractor={(q) => q.id}
          loading={loading}
          emptyText={t("scoring.table.empty")}
        />
      )}

      <Modal
        open={likertModalOpen}
        onClose={() => setLikertModalOpen(false)}
        title={t("scoring.likertModal.title")}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLikertModalOpen(false);
                downloadTemplate();
              }}
            >
              {t("scoring.likertModal.onlyDownload")}
            </Button>
            <Button
              disabled={!(Number(likertMax) > 0)}
              onClick={() => {
                setLikertModalOpen(false);
                downloadTemplate(Number(likertMax));
              }}
            >
              {t("scoring.likertModal.addAndDownload")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {t("scoring.likertModal.body")}
        </p>
        <div className="mt-4">
          <TextField
            label={t("scoring.likertModal.maxScore")}
            type="number"
            min={0}
            step="0.25"
            value={likertMax}
            onChange={(e) => setLikertMax(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
