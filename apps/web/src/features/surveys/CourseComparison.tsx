import { exportChartAsPng } from "../reports/lib/chart-export";
import { useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { courseResultCategories, selectCourseResultCategories, mostImprovedKnowledge, type CourseResultsDto, type PrePostBase } from "@epi/shared";
import { Button, Card, Dropdown, Table } from "../../shared/components";
import type { Column } from "../../shared/components";

const number = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
const percent = (value: number | null) => value === null ? "Sin datos" : `${number.format(value)}%`;
const change = (value: number | null) => value === null ? "Sin datos" : `${value > 0 ? "+" : ""}${number.format(value)} pp`;
const scorePercent = (base: PrePostBase) => base.valid && base.points !== null && base.applicableMaximum !== null && base.applicableMaximum > 0 ? base.points / base.applicableMaximum * 100 : null;
const palette = ["#ef8200", "#4297b5", "#acc687", "#766a8a", "#6aa84f"];
const average = (base: PrePostBase) => base.valid && base.points !== null ? number.format(base.points / base.valid) : "Sin datos";
export function rankedCourseQuestions(result: CourseResultsDto) {
  const rows = result.questions.filter(question => question.definitionId === result.primaryDefinitionId).map(question => {
    const pre = scorePercent(question.pre), post = scorePercent(question.post);
    return { ...question, prePercent: pre, postPercent: post, change: pre === null || post === null ? null : post - pre };
  }).sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity) || a.text.localeCompare(b.text));
  let previous: number | null = null, rank = 0;
  return rows.map((row, index) => {
    if (row.change !== null && row.change !== previous) rank = index + 1;
    previous = row.change;
    return { ...row, rank: row.change === null ? null : rank };
  });
}


export function orderCourseQuestions(rows: ReturnType<typeof rankedCourseQuestions>, order: string) {
  const grouped = order.startsWith("category");
  const ascending = order.endsWith("asc");
  return [...rows].sort((a, b) => {
    if (grouped) {
      const group = (a.category ?? "").localeCompare(b.category ?? "") || (a.subcategory ?? "").localeCompare(b.subcategory ?? "");
      if (group) return group;
    }
    if (a.change === null) return b.change === null ? a.text.localeCompare(b.text) : 1;
    if (b.change === null) return -1;
    return (ascending ? a.change - b.change : b.change - a.change) || a.text.localeCompare(b.text);
  });
}

export function instrumentIndicatorCategory(category: string | null) {
  const label = (category ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (["competencies", "competencias", "competency"].includes(label)) return "competencies";
  if (["self efficacy", "autoeficacia", "dispositions", "disposiciones", "dispositions toward the environment", "dispositions towards the environment"].includes(label)) return "self-efficacy-dispositions";
  return null;
}

export function CourseCategorySelector({ available, included, onChange, disabled = false }: { available: string[]; included: string[]; onChange: (categories: string[]) => void; disabled?: boolean }) {
  return <Card><h2 className="mb-3 font-semibold">Categorías incluidas</h2><div className="flex flex-wrap gap-4">{available.map((category, index) => <label key={category} className="flex items-center gap-2"><input type="checkbox" disabled={disabled} checked={included.includes(category)} onChange={() => onChange(included.includes(category) ? included.filter(item => item !== category) : available.filter(item => included.includes(item) || item === category))} /><span aria-hidden="true" className="h-3 w-3 rounded" style={{ backgroundColor: palette[index % palette.length] }} />{category}</label>)}</div><p className="mt-3 text-sm text-gray-500">Se mostrarán los resultados de las categorías incluidas. El índice utiliza sus pesos proporcionales.</p></Card>;
}

export function CourseComparison({ result: source, availableCategories, hideCategorySelector = false }: { result: CourseResultsDto; availableCategories?: string[] | undefined; hideCategorySelector?: boolean }) {
  const radarRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLDivElement>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [order, setOrder] = useState("category-desc");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [questionOptions, setQuestionOptions] = useState<string[]>([]);
  const allCategories = availableCategories ?? courseResultCategories(source);
  const included = allCategories.filter(category => !excluded.includes(category));
  const result = hideCategorySelector || !excluded.length ? source : included.length
    ? selectCourseResultCategories(source, included)
    : { ...source, questions: [], groups: [], aggregates: [], distributions: [] };
  const aggregate = result.aggregates.filter(row => row.definitionId === result.primaryDefinitionId);
  const selected = (category: string | null) => !excluded.includes(category ?? "");
  const categoryColor = (category: string | null) => palette[Math.max(0, allCategories.indexOf(category ?? "")) % palette.length]!;
  const categories = aggregate.filter(row => row.level !== "index" && selected(row.category))
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || Number(b.level === "category") - Number(a.level === "category") || (a.subcategory ?? "").localeCompare(b.subcategory ?? ""));
  const chart = categories.filter(row => row.level === "category").map(row => ({ name: row.category ?? "", pre: row.pre, post: row.post }));
  const slope = (["pre", "post"] as const).map(moment => Object.fromEntries([
    ["moment", moment === "pre" ? "Pre" : "Post"],
    ...chart.map((row, index) => [`category${index}`, row[moment]]),
  ]));
  const index = aggregate.find(row => row.level === "index");
  const momentLegend = [{ label: "Pre", color: "#ef8200" }, { label: "Post", color: "#4297b5" }];
  const categoryDataAvailable = chart.some(row => row.pre !== null || row.post !== null);

  const ranked = rankedCourseQuestions(result).filter(row => selected(row.category));
  const questions = orderCourseQuestions(ranked, order);
  const knowledge = mostImprovedKnowledge(result);
  const competencyCategories = aggregate.filter(row => row.level === "category" && instrumentIndicatorCategory(row.category) === "competencies");
  const competency = [...competencyCategories].filter(row => row.change !== null && row.change > 0).sort((a, b) => b.change! - a.change!)[0];
  const impactCategories = aggregate.filter(row => row.level === "category" && instrumentIndicatorCategory(row.category) === "self-efficacy-dispositions");
  type CategoryRow = (typeof categories)[number];
  type QuestionRow = (typeof questions)[number];
  const categoryQuestions = (row: CategoryRow) => result.questions.filter(question => question.definitionId === row.definitionId && question.category === row.category && (row.level === "category" || question.subcategory === row.subcategory));
  const distribution = result.distributions.find(item => item.definitionId === result.primaryDefinitionId);
  const weight = (row: CategoryRow) => row.level === "category"
    ? distribution?.categoryWeights?.find(item => item.category === row.category)?.weight ?? null
    : distribution?.subcategoryWeights?.find(item => item.category === row.category && item.subcategory === row.subcategory)?.weight ?? null;
  const optionalCategory: Column<CategoryRow>[] = [
    { key: "weight", header: "Peso", render: row => percent(weight(row)) },
    { key: "questionMaximum", header: "Máximo por pregunta", render: row => {
      const maxima = [...new Set(categoryQuestions(row).map(question => question.maximum))];
      return maxima.length === 1 && maxima[0] !== null ? maxima[0] : "Varios / pendiente";
    } },
    { key: "maximum", header: "Máximo normalizado", render: () => "100" },
    { key: "sd", header: "DE Pre/Post (0–100)", render: row => {
      const stats = row.standardDeviation;
      if (!stats) return distribution?.standardDeviation === "disabled" ? "Desactivada en el instrumento" : "No disponible en esta versión";
      return <div className="min-w-52"><p>{stats.method === "sample" ? "Muestral" : "Poblacional"}</p>{(["pre", "post"] as const).map(moment => <div key={moment} className="mt-1"><p>{moment === "pre" ? "Pre" : "Post"}: {stats[moment].value === null ? "No disponible" : number.format(stats[moment].value)} · N {stats[moment].n}</p><p className="text-xs">Media de envíos: {stats[moment].mean === null ? "Sin datos" : number.format(stats[moment].mean)}</p></div>)}</div>;
    } },
  ];
  const categoryColumns: Column<CategoryRow>[] = [
    { key: "category", header: "Categoría / subcategoría", render: row => <div className={row.level === "category" ? "font-semibold" : "pl-5"} style={categoryOptions.includes("color") ? { borderLeft: `4px solid ${categoryColor(row.category)}`, paddingLeft: 12 } : undefined}>{row.level === "category" ? row.category : row.subcategory}{row.issue && <p className="text-xs text-danger">{row.issue}</p>}</div> },
    { key: "count", header: "# preguntas", render: row => categoryQuestions(row).length },
    { key: "mean", header: "Media ponderada (0–100)", render: row => <div><p>Pre {row.pre === null ? "Sin datos" : number.format(row.pre)}</p><p>Post {row.post === null ? "Sin datos" : number.format(row.post)}</p></div> },
    ...optionalCategory.filter(column => categoryOptions.includes(column.key)),
    { key: "pre", header: "Pre", render: row => row.pre === null ? "Sin datos" : `${number.format(row.pre)} pts (${percent(row.pre)})` },
    { key: "post", header: "Post", render: row => row.post === null ? "Sin datos" : `${number.format(row.post)} pts (${percent(row.post)})` },
    { key: "change", header: "Cambio", render: row => change(row.change) },
  ];
  const questionColumns: Column<QuestionRow>[] = [
    { key: "category", header: "Categoría / subcategoría", render: row => <div>{row.category ?? "Categoría pendiente"}<p className="text-sm">{row.subcategory ?? "Subcategoría pendiente"}</p></div> },
    { key: "text", header: "Pregunta", render: row => <details className="w-64"><summary className="cursor-pointer truncate" title={row.text}>{row.text}</summary><p className="whitespace-normal break-words">{row.text}</p></details> },
    ...(questionOptions.includes("maximum") ? [{ key: "maximum", header: "Máximo", render: (row: QuestionRow) => row.maximum ?? "Pendiente" }] : []),
    { key: "pre", header: "Promedio Pre", render: row => `${average(row.pre)} (${percent(row.prePercent)})` },
    { key: "post", header: "Promedio Post", render: row => `${average(row.post)} (${percent(row.postPercent)})` },
    { key: "change", header: "Cambio", render: row => change(row.change) },
    ...(questionOptions.includes("rank") ? [{ key: "rank", header: "Rank global", render: (row: QuestionRow) => row.rank ?? "—" }] : []),
  ];
  function toggle(value: string, current: string[], set: (value: string[]) => void) {
    set(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  }
  const subcategories = categories.filter(row => row.level === "subcategory" && row.change !== null);
  const greatest = [...subcategories].filter(row => row.change! > 0).sort((a, b) => b.change! - a.change! || (a.subcategory ?? "").localeCompare(b.subcategory ?? "")).slice(0, 3);
  const declines = [...subcategories].filter(row => row.change! < 0).sort((a, b) => a.change! - b.change! || (a.subcategory ?? "").localeCompare(b.subcategory ?? "")).slice(0, 3);
  const topColumns: Column<CategoryRow>[] = [
    { key: "area", header: "Subcategoría", render: row => <div>{row.subcategory}<p className="text-xs">{row.category}</p></div> },
    { key: "change", header: "Cambio", render: row => change(row.change) },
  ];

  return <div className="space-y-4">
    <div className="grid gap-3 lg:grid-cols-3">
      <Card><h2 className="font-semibold">Overall improvement</h2><p>{change(index?.change ?? null)}</p></Card>
      <Card><h2 className="font-semibold">Mayor mejora en Knowledge</h2><p>{knowledge.map(row => `${row.subcategory}: ${change(row.change)}`).join(", ") || "Sin mejora positiva"}</p></Card>
      {competencyCategories.length > 0 && <Card><h2 className="font-semibold">Mayor mejora en competencias</h2><p>{competency ? `${competency.category}: ${change(competency.change)}` : competencyCategories.some(row => row.change !== null) ? "Sin mejora positiva" : "Sin datos comparables"}</p></Card>}
    </div>
    {!hideCategorySelector && <CourseCategorySelector available={allCategories} included={allCategories.filter(category => selected(category))} onChange={included => setExcluded(allCategories.filter(category => !included.includes(category)))} />}
    {result.demographics && <Card><h2 className="font-semibold">Participación</h2>{(["pre", "post"] as const).map(moment => <p key={moment}>{moment === "pre" ? "Pre" : "Post"} · {result.demographics![moment].men} hombres · {result.demographics![moment].women} mujeres · {result.demographics![moment].other} otras respuestas · {result.demographics![moment].unknown} sin dato</p>)}</Card>}
    <details open><summary className="cursor-pointer font-semibold">Gráficas Pre/Post e índice</summary><div className="mt-3 grid gap-4 lg:grid-cols-2">
      <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Perfil Pre/Post por categoría</h2><Button variant="secondary" size="sm" disabled={chart.length < 3 || !categoryDataAvailable} aria-label="Descargar Perfil Pre/Post por categoría en PNG" onClick={() => { if (radarRef.current) exportChartAsPng(radarRef.current, `curso-${result.courseId}-perfil-pre-post`, 2, momentLegend); }}>Descargar PNG</Button></div><div ref={radarRef}>{chart.length >= 3 ? <ResponsiveContainer width="100%" height={300}><RadarChart data={chart}><PolarGrid /><PolarAngleAxis dataKey="name" /><PolarRadiusAxis domain={[0, 100]} /><Radar name="Pre" dataKey="pre" stroke="#ef8200" fill="#ef8200" fillOpacity={0.15} /><Radar name="Post" dataKey="post" stroke="#4297b5" fill="#4297b5" fillOpacity={0.15} /><Legend /><Tooltip /></RadarChart></ResponsiveContainer> : <p>Selecciona al menos tres categorías para el radar.</p>}</div></Card>
      <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Pre/Post por categoría</h2><Button variant="secondary" size="sm" disabled={!categoryDataAvailable} aria-label="Descargar Pre/Post por categoría en PNG" onClick={() => { if (barsRef.current) exportChartAsPng(barsRef.current, `curso-${result.courseId}-barras-pre-post`, 2, momentLegend); }}>Descargar PNG</Button></div><div ref={barsRef}>{chart.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Legend /><Bar dataKey="pre" name="Pre" fill="#ef8200" /><Bar dataKey="post" name="Post" fill="#4297b5" /></BarChart></ResponsiveContainer> : <p>Sin categorías seleccionadas.</p>}</div></Card>
      <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Cambio entre Pre y Post</h2><Button variant="secondary" size="sm" disabled={!categoryDataAvailable} aria-label="Descargar Cambio entre Pre y Post en PNG" onClick={() => { if (linesRef.current) exportChartAsPng(linesRef.current, `curso-${result.courseId}-cambio-pre-post`, 2, chart.map(row => ({ label: row.name, color: categoryColor(row.name) }))); }}>Descargar PNG</Button></div><div ref={linesRef}>{chart.length ? <ResponsiveContainer width="100%" height={300}><LineChart data={slope}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="moment" /><YAxis domain={[0, 100]} /><Tooltip /><Legend />{chart.map((row, position) => <Line key={row.name} dataKey={`category${position}`} name={row.name} stroke={categoryColor(row.name)} connectNulls={false} />)}</LineChart></ResponsiveContainer> : <p>Sin categorías seleccionadas.</p>}</div></Card>
      <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Índice de alfabetización ambiental</h2><Button variant="secondary" size="sm" disabled={!index || index.pre === null && index.post === null} aria-label="Descargar Índice de alfabetización ambiental en PNG" onClick={() => { if (indexRef.current) exportChartAsPng(indexRef.current, `curso-${result.courseId}-indice-alfabetizacion`, 2, momentLegend); }}>Descargar PNG</Button></div><div ref={indexRef}><p className="mb-3 text-sm">Resultado global sobre 100.</p>{index && (index.pre !== null || index.post !== null) ? <ResponsiveContainer width="100%" height={260}><BarChart data={[{ name: "IAA", pre: index.pre, post: index.post }]}><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Legend /><Bar dataKey="pre" name="Pre" fill="#ef8200" /><Bar dataKey="post" name="Post" fill="#4297b5" /></BarChart></ResponsiveContainer> : <p>Se requieren distribuciones completas y respuestas válidas para el índice.</p>}</div></Card>
    </div></details>
    <Card><details><summary className="cursor-pointer font-semibold">Información por categoría · {categories.length} filas</summary><div className="mt-4"><fieldset className="mb-4 flex flex-wrap gap-4"><legend className="mb-2 text-sm">Columnas opcionales</legend>{[["weight", "Peso"], ["questionMaximum", "Máximo por pregunta"], ["maximum", "Máximo normalizado"], ["sd", "Desviación estándar"], ["color", "Mostrar por color"]].map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={categoryOptions.includes(key!)} onChange={() => toggle(key!, categoryOptions, setCategoryOptions)} />{label}</label>)}</fieldset>{categoryOptions.includes("sd") && <p className="mb-3 text-sm">La desviación estándar describe puntajes por envío en escala de 0 a 100 y muestra su propia media. La media ponderada de la tabla sigue la agregación por pregunta.</p>}<Table rows={categories} keyExtractor={row => JSON.stringify([row.definitionId, row.category, row.subcategory])} columns={categoryColumns} pageSize={10} /></div></details></Card>
    <Card><details><summary className="cursor-pointer font-semibold">Información por pregunta · {questions.length} preguntas</summary><div className="mt-4"><div className="mb-4 flex flex-wrap items-end gap-4"><Dropdown label="Orden de preguntas" value={order} onChange={setOrder} options={[{ value: "category-desc", label: "Mayor a menor por categoría y subcategoría" }, { value: "category-asc", label: "Menor a mayor por categoría y subcategoría" }, { value: "global-asc", label: "Menor a mayor entre todas las preguntas" }, { value: "global-desc", label: "Mayor a menor entre todas las preguntas" }]} />{[["maximum", "Máximo"], ["rank", "Rank global"]].map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={questionOptions.includes(key!)} onChange={() => toggle(key!, questionOptions, setQuestionOptions)} />{label}</label>)}</div><p className="mb-3 text-sm">El promedio se expresa en puntos y porcentaje de su máximo. El cambio es Post − Pre en puntos porcentuales. Las preguntas sin comparación aparecen al final de su grupo.</p><Table rows={questions} keyExtractor={row => row.id} columns={questionColumns} pageSize={10} /></div></details></Card>
    <div className="grid gap-4 xl:grid-cols-3">
      <Card><h2 className="mb-3 font-semibold">Greatest Improvement</h2><p className="mb-3 text-sm">Tres subcategorías con mayor mejora positiva.</p><Table rows={greatest} keyExtractor={row => JSON.stringify([row.category, row.subcategory])} columns={topColumns} emptyText="Sin mejoras positivas comparables." /></Card>
      <Card><h2 className="mb-3 font-semibold">Greatest Decline</h2><p className="mb-3 text-sm">Tres subcategorías con mayor descenso.</p><Table rows={declines} keyExtractor={row => JSON.stringify([row.category, row.subcategory])} columns={topColumns} emptyText="Sin descensos comparables." /></Card>
      {impactCategories.length > 0 && <Card><h2 className="mb-3 font-semibold">{impactCategories.map(row => row.category).join(" / ")}</h2><Table rows={impactCategories.filter(row => selected(row.category))} keyExtractor={row => row.category!} columns={[
        { key: "category", header: "Categoría" },
        { key: "pre", header: "Pre", render: row => percent(row.pre) },
        { key: "post", header: "Post", render: row => percent(row.post) },
        { key: "change", header: "Cambio", render: row => change(row.change) },
      ]} emptyText="Sin categorías seleccionadas." /></Card>}
    </div>
  </div>;
}
