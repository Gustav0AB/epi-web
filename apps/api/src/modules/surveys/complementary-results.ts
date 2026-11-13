import { relativeChange, SurveySetupQuestionSchema, type CourseComplementResultsDto, type CourseResultsDto, type ComplementDistribution } from "@epi/shared";
import { courseResultBases, courseResultsAnswers, type ResultsDefinition, type ResultsReceipt } from "./course-results.js";
import { aggregateCourseQuestions } from "./course-aggregation.js";
export function complementaryResults(primary: CourseResultsDto, definition: ResultsDefinition, receipts: ResultsReceipt[]): CourseComplementResultsDto {
 const adapted = {...definition,instrumentKind:"LEARNING"};
 const bases = courseResultBases(receipts.map(receipt=>({...receipt,definition:adapted,moment:"POST"})),[adapted]);
 const distributions: ComplementDistribution[] = definition.questions.filter(question=>question.role==="SCORED" && question.type!=="OPEN_TEXT").map(question=>{
  const parsed=SurveySetupQuestionSchema.safeParse({...question,weight:undefined});
  return {id:question.id,text:question.text,category:parsed.success ? parsed.data.classification?.category ?? null : null,subcategory:parsed.success ? parsed.data.classification?.subcategory ?? null : null,answered:0,blank:0,invalid:0,options:question.options.map(value=>({value,count:0}))};
 });
 for(const receipt of receipts){
  if(receipt.excluded || receipt.contextPending)continue;
  const answers=courseResultsAnswers(receipt.rawJsonData,definition);if(!answers)continue;
  for(const row of distributions){
   const source=definition.questions.find(question=>question.id===row.id)!;const values=answers.get(source.externalId) ?? [];
   if(!values.length || values.length===1 && (values[0]===null || typeof values[0]==="string" && !values[0].trim())){row.blank++;continue;}
   const value=values.length===1 && (typeof values[0]==="string" || typeof values[0]==="number" && Number.isFinite(values[0])) ? String(values[0]).trim() : null;
   const option=value===null ? null : row.options.find(option=>option.value===value);
   if(option){option.count++;row.answered++;}else row.invalid++;
  }
 }
 const main=primary.aggregates.filter(row=>row.definitionId===primary.primaryDefinitionId && row.level!=="index");
 const follow=definition.instrumentKind==="FOLLOW_UP" ? aggregateCourseQuestions(bases.questions,[adapted]).filter(row=>row.level!=="index") : [];
 const keys=[...new Set([...main,...follow].map(row=>JSON.stringify([row.category,row.subcategory])))];
 const comparison=definition.instrumentKind!=="FOLLOW_UP" ? [] : keys.map(key=>{
  const before=main.find(row=>JSON.stringify([row.category,row.subcategory])===key);const after=follow.find(row=>JSON.stringify([row.category,row.subcategory])===key);
  const pre=before?.pre ?? null;const post=before?.post ?? null;const value=after?.post ?? null;const [category,subcategory]=JSON.parse(key) as [string,string|null];
  return {category,subcategory,pre,post,followUp:value,fromPre:relativeChange(pre,value),fromPost:relativeChange(post,value),issue:after?.issue ?? before?.issue ?? (!after ? "Sin evaluación de seguimiento para esta clasificación" : null)};
 });
 return {courseId:primary.courseId,courseName:primary.name,definitionId:definition.id,instrument:definition.instrumentName || "Instrumento",version:definition.version,kind:definition.instrumentKind as "FOLLOW_UP"|"CQS",receipts:bases.postReceipts,excluded:bases.excludedReceipts,contextPending:bases.contextPendingReceipts,sourcePending:bases.sourcePendingReceipts,comparison,distributions,questions:bases.questions,pending:definition.instrumentKind==="CQS" ? ["Se muestran únicamente respuestas del instrumento de calidad seleccionado. La fórmula de satisfacción CQS sigue pendiente de validación."] : ["Comparación por categoría/subcategoría, sin emparejar personas. Se conserva la versión de cada instrumento; no se copian reglas desde el instrumento principal.","Las reglas antiguas de pre_post_post no se convierten automáticamente: revisa la configuración del instrumento complementario si no hay resultados."]};
}
