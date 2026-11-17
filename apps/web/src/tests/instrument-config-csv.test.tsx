import { describe,it,expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { csvCell,parseCsv,instrumentQuestion,assistantScoringReady,SurveySetupDraftSchema,type SurveySetupQuestion,type SiteDto,type CategoryDto } from "@epi/shared";
import { exportInstrumentConfigCsv,previewInstrumentConfigCsv } from "../features/surveys/instrument-config-csv";
import { InstrumentConfigCsv } from "../features/surveys/InstrumentConfigCsv";
const site="11111111-1111-4111-8111-111111111111",organization="22222222-2222-4222-8222-222222222222";
const sites=[{id:site,organizationId:organization,name:"Sitio",isActive:true,programs:["Local"],activityTypes:["Visita"]}] as SiteDto[];
const categories:CategoryDto[]=[{id:"cat",organizationId:organization,name:"Learning",subcategory:"Knowledge",isActive:true}];
const question:SurveySetupQuestion & {options:string[];controlType:string}={externalId:"q",text:'¿Por qué, "cuidar"?',type:"ONE_ANSWER",role:"SCORED",controlType:"control_radio",options:["Sí, siempre","No"],classification:{category:"Learning",subcategory:"Knowledge"},isFilter:true,optionLabels:[{value:"Sí, siempre",label:"Sí"}],weight:{category:"Learning",subcategory:"Knowledge",maxScore:0,correctAnswer:null,factor:3},analysisParticipation:[{analysisType:"pre_post",enabled:true},{analysisType:"pre_post_post",enabled:false}],analysisScoring:[{analysisType:"pre_post",maxScore:5,correctAnswer:"Sí, siempre",scoringMode:"standard",responsePolicy:{blank:"exclude",invalid:"review"}}]};
const draft=SurveySetupDraftSchema.parse({configurationMode:"instrument",siteId:site,type:"LOCAL",programName:"Local",instrumentKind:"LEARNING",instrumentName:"Formulario",activityName:"Curso",activityType:"Visita",description:"Descripción, en dos\nlíneas",scoringWeightsVersion:4,analysisWeights:[{analysisType:"pre_post",categoryWeights:[{category:"Learning",weight:100}],subcategoryWeights:[{category:"Learning",subcategory:"Knowledge",weight:100}]}],questions:[question]});
function rewrite(csv:string,change:(rows:Record<string,string>[])=>void){const rows=parseCsv(csv,{strict:true});const headers=Object.keys(rows[0]!);change(rows);return [headers.join(","),...rows.map(row=>headers.map(header=>csvCell(row[header] ?? "")).join(","))].join("\n");}
describe("complete instrument CSV",()=>{
 it("round trips quoted source, general settings, scoring, weights, filters and catalog references without saving",()=>{
  const original=JSON.stringify(draft);const csv=exportInstrumentConfigCsv("form",draft,[question],categories,sites);const result=previewInstrumentConfigCsv(csv,"form",draft,[question],categories,sites);
  expect(result.errors).toEqual([]);expect(assistantScoringReady([{...result.draft!.questions![0]!,options:question.options}])).toBe(true);expect(result.draft?.description).toBe(draft.description);expect(result.draft?.questions?.[0]?.analysisScoring?.[0]?.correctAnswer).toBe("Sí, siempre");expect(result.draft?.questions?.[0]?.weight?.factor).toBe(3);expect(result.draft?.questions?.[0]?.optionLabels?.[0]?.label).toBe("Sí");expect(result.draft?.analysisWeights).toEqual(draft.analysisWeights);expect(JSON.stringify(draft)).toBe(original);expect(csv).toContain("catalogo_categoria");
 });
 it("preserves several correct choices in the complete CSV",()=>{
  const multi={...question,analysisScoring:[{...question.analysisScoring![0]!,correctAnswers:[...question.options]}]};
  const csv=exportInstrumentConfigCsv("form",draft,[multi],categories,sites);
  const result=previewInstrumentConfigCsv(csv,"form",draft,[multi],categories,sites);
  expect(result.errors).toEqual([]);expect(result.draft?.questions?.[0]?.analysisScoring?.[0]?.correctAnswers).toEqual(question.options);
 });
 it("rejects another source, missing or duplicate questions, altered options and foreign catalog references atomically",()=>{
  const csv=exportInstrumentConfigCsv("form",draft,[question],categories,sites);
  for(const modify of [(rows:Record<string,string>[])=>{rows.forEach(row=>row.formulario="other");},(rows:Record<string,string>[])=>{rows.push({...rows.find(row=>row.tipo==="pregunta")!});},(rows:Record<string,string>[])=>{rows.splice(rows.findIndex(row=>row.tipo==="pregunta"),1);},(rows:Record<string,string>[])=>{rows.find(row=>row.tipo==="opcion")!.valor="Desconocida";},(rows:Record<string,string>[])=>{rows.find(row=>row.tipo==="pregunta")!.subcategoria="Ajena";}]){
   const result=previewInstrumentConfigCsv(rewrite(csv,modify),"form",draft,[question],categories,sites);expect(result.draft).toBeNull();expect(result.errors.length).toBeGreaterThan(0);
  }
 });
 it("protects formulas on download while preserving the original literal question on import",()=>{
  const source={...question,text:"=1+1"};const csv=exportInstrumentConfigCsv("form",draft,[source],categories,sites);expect(csv).toContain("'=1+1");expect(previewInstrumentConfigCsv(csv,"form",draft,[source],categories,sites).errors).toEqual([]);
 });
 it("never activates free-text scoring and removes question-level post-post participation",()=>{
  expect(instrumentQuestion({...question,type:"OPEN_TEXT"}).analysisParticipation?.some(item=>item.enabled)).toBe(false);
  const result=instrumentQuestion({...question,analysisParticipation:[{analysisType:"pre_post",enabled:false},{analysisType:"pre_post_post",enabled:true}]});expect(result.analysisParticipation).toEqual([{analysisType:"pre_post",enabled:true},{analysisType:"pre_post_post",enabled:false}]);
 });
 it("derives the category from its unique subcategory and includes available groups for offline configuration",()=>{
  const all=[...categories,{...categories[0]!,id:"new",name:"Action",subcategory:"Behavior"}];
  const csv=exportInstrumentConfigCsv("form",draft,[question],all,sites);
  expect(parseCsv(csv).some(row=>row.tipo==="subcategoria" && row.subcategoria==="Behavior")).toBe(true);
  const result=previewInstrumentConfigCsv(rewrite(csv,rows=>{rows.find(row=>row.tipo==="pregunta")!.categoria="";}),"form",draft,[question],all,sites);
  expect(result.errors).toEqual([]);expect(result.draft?.questions?.[0]?.classification?.category).toBe("Learning");
 });
 it("requires explicit review instead of converting a legacy partial-points rule",()=>{
  const legacy={...question,analysisScoring:[{analysisType:"pre_post" as const,scoringMode:"option_scores" as const,maxScore:5,correctAnswer:null,optionScores:[{value:"Sí, siempre",score:5},{value:"No",score:2}]}]};
  const csv=exportInstrumentConfigCsv("form",draft,[legacy],categories,sites);
  expect(csv).toContain("requiere_revision");expect(previewInstrumentConfigCsv(csv,"form",draft,[legacy],categories,sites).draft).toBeNull();
 });
 it("exposes CSV configuration on step one without calling onApply during rendering",()=>{
  let applied=false;const html=renderToStaticMarkup(<InstrumentConfigCsv formId="form" draft={draft} questions={[question]} categories={categories} sites={sites} onApply={()=>{applied=true;}} />);expect(html).toContain("Configurar por CSV");expect(applied).toBe(false);
 });
});
