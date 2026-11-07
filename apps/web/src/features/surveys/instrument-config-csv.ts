import { SurveySetupQuestionSchema, csvCell, parseCsv, questionSection, questionClassification, instrumentQuestion, preserveOpenQuestion, SurveySetupDraftSchema, type SurveySetupDraft, type SurveySetupQuestion, type CategoryDto, type SiteDto } from "@epi/shared";
type Question = SurveySetupQuestion & { options: string[]; controlType?: string };
const headers = ["tipo","formulario","clave","valor","seccion","pregunta","tipo_respuesta","rol","categoria","subcategoria","filtro","maximo","peso","correcta","inversa","no_puntuable","etiqueta","momento"] as const;
const fields = ["siteId","type","programName","instrumentKind","instrumentName","activityName","activityType","description"] as const;
type CsvRow = Record<typeof headers[number],string>;
const unsafeStart = (value: string) => ["=","+","-","@","'","\t","\r"].includes(value[0] ?? "");
const safeCell = (value: string) => unsafeStart(value) ? "'"+value : value;
const readCell = (value: string) => value.startsWith("'") && unsafeStart(value.slice(1)) ? value.slice(1) : value;
export type InstrumentCsvPreview = { draft: SurveySetupDraft | null; errors: { row: number; message: string }[]; questionCount: number };
export function exportInstrumentConfigCsv(formId: string, draft: SurveySetupDraft, questions: Question[], categories: CategoryDto[], sites: SiteDto[]): string {
 const rows: Partial<CsvRow>[] = [{ tipo: "formato", clave: "version", valor: "1" },...fields.map(key => ({ tipo: "general", clave: key, valor: draft[key] ?? "" }))];
 for (const question of questions.filter(question => !question.sourceContext?.matrixParent)) {
  const rule = question.analysisScoring?.find(rule => rule.analysisType === "pre_post"); const classification = questionClassification(question);
  rows.push({ tipo: "pregunta", clave: question.externalId, seccion: questionSection(question).label, pregunta: question.text, tipo_respuesta: question.type, rol: question.role ?? "SCORED", categoria: classification?.category ?? "", subcategoria: classification?.subcategory ?? "", filtro: question.isFilter ? "true" : "false", maximo: rule?.maxScore == null ? "" : String(rule.maxScore), peso: String(question.weight?.factor ?? 1), correcta: rule?.correctAnswer ?? "", inversa: rule?.inverse ? "true" : "false", valor: rule && (rule.scoringMode === "option_scores" || rule.scoringMode === "numeric_range" || rule.optionScores !== undefined || rule.numericRange !== undefined) ? "requiere_revision" : rule?.scoringMode === "ordered_scale" ? "escala" : question.type === "ONE_ANSWER" ? "correcta" : "escala" });
  question.options.forEach(value => rows.push({ tipo: "opcion", clave: question.externalId, valor: value, no_puntuable: rule?.excludedOptions?.includes(value) ? "true" : "false", etiqueta: question.optionLabels?.find(item => item.value === value)?.label ?? value, momento: question.momentMappings?.find(item => item.value === value)?.moment ?? "" }));
 }
 const weights = draft.analysisWeights?.find(item => item.analysisType === "pre_post");
 const categoriesUsed = [...new Set([...categories.filter(item => item.isActive).map(item => item.name),...questions.filter(question => question.role === "SCORED" && question.type !== "OPEN_TEXT").flatMap(question => questionClassification(question)?.category || [])])];
 for (const category of categoriesUsed) rows.push({ tipo: "categoria", categoria: category, peso: String(weights?.categoryWeights.find(item => item.category === category)?.weight ?? "") });
 const groups = new Map(questions.filter(question => question.role === "SCORED" && question.type !== "OPEN_TEXT").flatMap(question => { const classification = questionClassification(question); return classification?.category && classification.subcategory ? [[JSON.stringify(classification),classification] as const] : []; }));
 for (const category of categories.filter(item => item.isActive && item.subcategory)) {
  const group = {category:category.name,subcategory:category.subcategory!};
  if (![...groups.values()].some(item => item.category === group.category && item.subcategory === group.subcategory)) groups.set(JSON.stringify(group),group);
 }
 for (const group of groups.values()) rows.push({ tipo: "subcategoria", categoria: group.category, subcategoria: group.subcategory ?? "", peso: String(weights?.subcategoryWeights.find(item => item.category === group.category && item.subcategory === group.subcategory)?.weight ?? "") });
 for (const category of categories.filter(item => item.isActive)) rows.push({ tipo: "catalogo_categoria", clave: category.id, categoria: category.name, subcategoria: category.subcategory ?? "" });
 for (const site of sites.filter(site => site.isActive)) {
  rows.push({ tipo: "catalogo_sitio", clave: site.id, valor: site.name });
  site.programs?.forEach(value => rows.push({ tipo: "catalogo_programa", clave: site.id, valor: value }));
  site.activityTypes?.forEach(value => rows.push({ tipo: "catalogo_actividad", clave: site.id, valor: value }));
 }
 return "\uFEFF"+[headers.join(","),...rows.map(row => headers.map(header => csvCell(safeCell(header === "formulario" ? formId : row[header] ?? ""))).join(","))].join("\r\n");
}
export function previewInstrumentConfigCsv(text: string, formId: string, draft: SurveySetupDraft, questions: Question[], categories: CategoryDto[], sites: SiteDto[]): InstrumentCsvPreview {
 const errors: InstrumentCsvPreview["errors"] = []; const fail = (row: number,message: string) => errors.push({ row,message });
 let rows: CsvRow[];
 try { if (text.length > 2*1024*1024) throw Error("CSV mayor de 2 MB"); rows = parseCsv(text,{ strict: true, requiredHeaders: [...headers] }).map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,readCell(value)])) as CsvRow); if (rows.length > 20000) throw Error("Demasiadas filas"); } catch(error) { return { draft: null, questionCount: 0, errors: [{ row: 1, message: error instanceof Error ? error.message : "CSV inválido" }] }; }
 const source = questions.filter(question => !question.sourceContext?.matrixParent); const general: Record<string,string> = {};
 const edits = new Map<string,Question>(); const optionRows = new Map<string,CsvRow[]>(); const categoryWeights: {category:string;weight:number|null}[] = []; const subcategoryWeights: {category:string;subcategory:string;weight:number|null}[] = [];
 const numbers = (value: string, row: number, max = Number.MAX_VALUE) => { if (!value) return null; const n=Number(value); if (!Number.isFinite(n) || n<0 || n>max) { fail(row,"Número fuera de rango"); return null; } return n; };
 const boolean = (value: string,row: number) => { if (!["true","false",""] .includes(value)) fail(row,"Usa true o false"); return value === "true"; };
 let format = 0;
 rows.forEach((row,index) => {
  const line = index+2; if (row.formulario !== formId) { fail(line,"El archivo pertenece a otro formulario"); return; }
  if (row.tipo === "formato") { format++; if (row.clave !== "version" || row.valor !== "1") fail(line,"Versión de CSV no compatible"); return; }
  if (row.tipo.startsWith("catalogo_")) { if (!["catalogo_categoria","catalogo_sitio","catalogo_programa","catalogo_actividad"].includes(row.tipo)) fail(line,"Catálogo desconocido"); return; }
  if (row.tipo === "general") { if (!fields.includes(row.clave as typeof fields[number]) || Object.prototype.hasOwnProperty.call(general,row.clave)) fail(line,"Campo general desconocido o duplicado"); else general[row.clave]=row.valor!; return; }
  if (row.tipo === "categoria" || row.tipo === "subcategoria") {
   const weight = numbers(row.peso!,line,100);
   if (row.tipo === "categoria") categoryWeights.push({category:row.categoria!,weight}); else subcategoryWeights.push({category:row.categoria!,subcategory:row.subcategoria!,weight});
   return;
  }
  const question=source.find(question => question.externalId === row.clave);
  if (!question) { fail(line,"Pregunta desconocida o retirada del formulario"); return; }
  if (row.tipo === "opcion") { optionRows.set(question.externalId,[...(optionRows.get(question.externalId) ?? []),row]); return; }
  if (row.tipo !== "pregunta") { fail(line,"Tipo de fila desconocido"); return; }
  if (edits.has(question.externalId)) { fail(line,"Pregunta repetida"); return; }
  if (row.pregunta !== question.text.trim() || row.seccion !== questionSection(question).label.trim()) fail(line,"El texto o sección del origen cambió; descarga una plantilla actual");
  if (!row.categoria && row.subcategoria) {
   const matching = categories.filter(item => item.isActive && item.subcategory === row.subcategoria);
   const parents = [...new Set(matching.map(item => item.name))];
   if (parents.length === 1) row.categoria = parents[0]!; else fail(line,"La subcategoría requiere una categoría inequívoca del catálogo");
  }
  if (!row.categoria && row.peso !== "1") fail(line,"Selecciona una categoría antes de configurar un peso distinto de 1");
  const maximum=numbers(row.maximo!,line); const factor=numbers(row.peso!,line,10);
  if (factor === null || !Number.isInteger(factor) || factor<1) fail(line,"El peso de pregunta debe ser entero de 1 a 10");
  if (!["correcta","escala"].includes(row.valor!)) fail(line,"Método: correcta o escala");
  const edit = { ...question, setupReviewed: false, type: row.tipo_respuesta, role: row.rol, classification: {category:row.categoria!,subcategory:row.subcategoria || null}, isFilter:boolean(row.filtro!,line), weight: question.weight ? {...question.weight,factor:factor ?? 1} : row.categoria ? { category:row.categoria,subcategory:row.subcategoria || null,maxScore:0,correctAnswer:null,factor:factor ?? 1 } : null, analysisScoring: [{ analysisType:"pre_post",maxScore:maximum,correctAnswer:row.correcta || null,scoringMode:row.valor === "correcta" ? "standard" : "ordered_scale",...(row.valor === "escala" ? {scaleOptions: [...question.options],inverse:boolean(row.inversa!,line)} : {}),responsePolicy:{blank:"exclude",invalid:"review"} }] };
  // Validate the actual question boundary without trusting edited source/options.
  const checked = questionSchema(edit);
  if (!checked.success) { fail(line,"Rol, tipo o configuración de pregunta inválidos"); return; }
  if (question.type === "OPEN_TEXT" && row.tipo_respuesta !== "OPEN_TEXT") fail(line,"El texto abierto no se convierte en evaluable");
  edits.set(question.externalId,instrumentQuestion(question.type === "OPEN_TEXT" ? preserveOpenQuestion({...question,...checked.data}) : {...question,...checked.data}));
 });
 if (format !== 1) fail(1,"Se requiere una única fila formato/version/1");
 for (const field of fields) if (!Object.prototype.hasOwnProperty.call(general,field)) fail(1,`Falta información general: ${field}`);
 for (const question of source) {
  const edited=edits.get(question.externalId); if (!edited) { fail(1,`Falta la pregunta: ${question.text}`); continue; }
  const options=optionRows.get(question.externalId) ?? [];
  if (options.length !== question.options.length || question.options.some((value,index) => options[index]?.valor !== value)) fail(1,`Las opciones cambiaron o están repetidas: ${question.text}`);
  const excluded = options.filter(row => boolean(row.no_puntuable!,rows.indexOf(row)+2)).map(row => row.valor!);
  edited.optionLabels=options.map(row => ({value:row.valor!,label:row.etiqueta || row.valor!}));
  edited.momentMappings=options.filter(row => row.momento).map(row => ({ value:row.valor!,moment:row.momento as "PRE" | "POST" | "POST_POST" }));
  if (edited.analysisScoring?.[0]) edited.analysisScoring[0].excludedOptions=excluded;
  if (edited.isFilter && (!["control_radio","control_dropdown","control_yesno"].includes(question.controlType ?? "") || !question.options.length)) fail(1,`Esta pregunta no admite filtro: ${question.text}`);
  if (edited.role === "SCORED" && edited.type !== "OPEN_TEXT" && edited.classification?.subcategory && !categories.some(item => item.isActive && item.name === edited.classification?.category && item.subcategory === edited.classification.subcategory)) fail(1,`Clasificación fuera del catálogo: ${question.text}`);
 }
 for (const group of categoryWeights) if (!categories.some(item => item.isActive && item.name === group.category)) fail(1,`Categoría fuera del catálogo: ${group.category}`);
 for (const group of subcategoryWeights) if (!categories.some(item => item.isActive && item.name === group.category && item.subcategory === group.subcategory)) fail(1,`Subcategoría fuera del catálogo: ${group.subcategory}`);
 if (draft.baseDefinitionId && general.siteId !== draft.siteId) fail(1,"Una nueva versión debe conservar el sitio del instrumento vinculado");
 const site=sites.find(site => site.id === general.siteId && site.isActive); const current=sites.find(site => site.id === draft.siteId);
 if (!site || site.organizationId !== current?.organizationId) fail(1,"Selecciona primero un sitio de la organización correspondiente y vuelve a importar");
 if (site && (!site.programs?.includes(general.programName!) || !site.activityTypes?.includes(general.activityType!))) fail(1,"Programa o tipo de actividad fuera del catálogo del sitio");
 if (general.programName && general.type !== (general.programName === "Local" ? "LOCAL" : general.programName === "Visiting" ? "VISITING" : "OTHER")) fail(1,"La clasificación del programa no coincide: Local/LOCAL, Visiting/VISITING u otro/OTHER");
 if (general.instrumentName !== draft.instrumentName) fail(1,"El instrumento debe conservar el nombre del formulario");
 const input={...draft,...general,siteId:general.siteId || null,configurationMode:"instrument",matrixDefaults:[],questions:questions.map(question => edits.get(question.externalId) ?? question),analysisWeights:[{...draft.analysisWeights?.find(item => item.analysisType === "pre_post"),analysisType:"pre_post",categoryWeights,subcategoryWeights}]};
 const validated=SurveySetupDraftSchema.safeParse(input); if (!validated.success) fail(1,validated.error.issues.map(issue => issue.message).join("; "));
 return { draft:!errors.length && validated.success ? validated.data : null, errors, questionCount:edits.size };
}
const questionSchema = (value: unknown) => SurveySetupQuestionSchema.safeParse(value);
