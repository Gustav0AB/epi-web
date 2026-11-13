import {describe,it,expect,vi,afterEach} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {MemoryRouter} from "react-router-dom";
import type {CourseComplementResultsDto} from "@epi/shared";
import {ComplementResultsView,ComplementaryInstrumentsPage} from "../features/surveys/ComplementaryInstrumentsPage";
import {surveyApi} from "../features/surveys/api";
afterEach(()=>vi.unstubAllGlobals());
const result:CourseComplementResultsDto={courseId:"course",courseName:"Curso",definitionId:"follow",instrument:"Seguimiento",version:1,kind:"FOLLOW_UP",receipts:10,excluded:1,contextPending:0,sourcePending:0,questions:[],pending:[],comparison:[{category:"Learning",subcategory:"Knowledge",pre:25,post:50,followUp:75,fromPre:50,fromPost:25,issue:null}],distributions:[{id:"q",text:"Opinión",category:"Learning",subcategory:"Knowledge",answered:10,blank:0,invalid:0,options:[{value:"Sí",count:10}]}]};
describe("course complementary instruments",()=>{
 it("shows the three moments and independent information controls for follow-up",()=>{const html=renderToStaticMarkup(<ComplementResultsView result={result} />);expect(html).toContain("Cambio relativo desde Pre");expect(html).toContain("Cambio relativo desde Post");expect(html).toContain("Información que quieres ver");expect(html).toContain("75");});
 it("shows only its own response results for quality",()=>{const html=renderToStaticMarkup(<ComplementResultsView result={{...result,kind:"CQS",instrument:"Calidad",comparison:[]}} />);expect(html).toContain("Respuestas del instrumento seleccionado");expect(html).not.toContain("Cambio relativo desde Pre");expect(html).not.toContain("Nivel de comparación");});
 it("encodes both course and definition identifiers and requests the scoped result",async()=>{const fetch=vi.fn().mockResolvedValue({json:()=>Promise.resolve({success:true,data:result})});vi.stubGlobal("fetch",fetch);await surveyApi.courseComplementResults("course/id","definition/id");expect(fetch.mock.calls[0]![0]).toBe("/api/surveys/courses/course%2Fid/complements/definition%2Fid/results");});
 it("does not link an instrument or responses on initial render",()=>{const fetch=vi.fn();vi.stubGlobal("fetch",fetch);expect(renderToStaticMarkup(<MemoryRouter><ComplementaryInstrumentsPage /></MemoryRouter>)).toContain("Instrumentos complementarios");expect(fetch).not.toHaveBeenCalled();});
});
