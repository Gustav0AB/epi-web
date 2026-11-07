import assert from "node:assert/strict";
import { scorePrePostAnswer, type PrePostQuestion } from "@epi/shared";
import { courseResultBases, type ResultsDefinition, type ResultsReceipt } from "./course-results.js";
const scale: PrePostQuestion = { externalId: "scale", text: "Opinión", type: "LIKERT", role: "SCORED", options: ["Muy de acuerdo", "De acuerdo", "Neutral", "Desacuerdo", "Muy en desacuerdo"], classification: { category: "Learning", subcategory: "Attitudes" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: false }], analysisScoring: [{ analysisType: "pre_post", scoringMode: "ordered_scale", maxScore: 10, correctAnswer: null, inverse: false, scaleOptions: ["Muy de acuerdo", "De acuerdo", "Neutral", "Desacuerdo", "Muy en desacuerdo"], responsePolicy: { blank: "exclude", invalid: "review" } }] };
for (let i=0;i<5;i++) assert.equal(scorePrePostAnswer(scale,[scale.options[i]]).points, 10-i*2);
const inverse = structuredClone(scale); inverse.analysisScoring![0]!.inverse = true;
for (let i=0;i<5;i++) assert.equal(scorePrePostAnswer(inverse,[scale.options[i]]).points, 2+i*2);
for (const values of [[],[null],[""],["  "]]) assert.deepEqual(scorePrePostAnswer(scale,values),{ reason: "blank", points: null, maximum: null });
for (const values of [[false],[{}],[["Neutral"]],["Unknown"],["Neutral","Neutral"]]) assert.equal(scorePrePostAnswer(scale,values).reason,"invalid");
const excluded = structuredClone(scale); excluded.analysisScoring![0]!.excludedOptions = ["Neutral"]; assert.equal(scorePrePostAnswer(excluded,["Neutral"]).reason,"non_scorable");
const changed = { ...scale, options: [...scale.options].reverse() }; assert.equal(scorePrePostAnswer(changed,["Neutral"]).reason,"configuration_pending");
const zero = structuredClone(scale); zero.analysisScoring![0]!.maxScore = 0; assert.equal(scorePrePostAnswer(zero,["Neutral"]).reason,"zero_maximum");
const choice: PrePostQuestion = { ...scale, externalId: "choice", text: "Correcta", type: "ONE_ANSWER", options: ["A","B"], analysisScoring: [{ analysisType: "pre_post", scoringMode: "standard", maxScore: 2, correctAnswer: "A", responsePolicy: { blank: "exclude", invalid: "review" } }] };
assert.deepEqual(scorePrePostAnswer(choice,["B"]),{ reason: "valid", points: 0, maximum: 2 }); assert.equal(scorePrePostAnswer(choice,["A"]).points,2);
const definition: ResultsDefinition = { id: "v1", instrumentName: "Learning", version: 1, configurationVersion: 4, instrumentKind: "LEARNING", questions: [scale,choice].map(q => ({ ...q, role: q.role ?? "SCORED", id: q.externalId, classification: q.classification, analysisParticipation: q.analysisParticipation, analysisScoring: q.analysisScoring, sourceContext: null, weight: null })) };
const receipt = (answers: { questionId: string; value: unknown }[], patch: Partial<ResultsReceipt> = {}): ResultsReceipt => ({ definition, moment: "PRE", rawJsonData: { answers }, excluded: false, contextPending: false, ...patch });
const source = [receipt([{ questionId: "scale", value: "Muy de acuerdo" },{ questionId: "choice", value: "A" }]),receipt([{ questionId: "choice", value: "B" }]),receipt([], { excluded: true }),receipt([], { contextPending: true }),receipt([], { definition: { ...definition, id: "cqs", instrumentKind: "CQS" } }),receipt([], { definition: { ...definition, id: "old", configurationVersion: 3 } }),receipt([], { rawJsonData: { answers: [], unresolvedAnswers: [null] } })];
const original = JSON.stringify(source); const result = courseResultBases(source);
assert.equal(JSON.stringify(source),original); assert.equal(result.preReceipts,2); assert.equal(result.excludedReceipts,1); assert.equal(result.contextPendingReceipts,1); assert.equal(result.complementaryReceipts,1); assert.equal(result.unsupportedVersionReceipts,1); assert.equal(result.sourcePendingReceipts,1);
assert.deepEqual(result.groups[0]!.pre,{ receipts: 2, complete: 1, incomplete: 1, withoutData: 0, validAnswers: 3 });
assert.equal(result.questions[0]!.pre.points,10); assert.equal(result.questions[0]!.pre.applicableMaximum,10); assert.equal(result.questions[0]!.pre.blank,1);
assert.equal(result.questions[1]!.pre.points,2); assert.equal(result.questions[1]!.pre.applicableMaximum,4); assert.equal(result.questions[1]!.post.points,null);
const newer = { ...definition, id: "v2", version: 2, questions: definition.questions.map(q => ({ ...q, id: q.id+"-new" })) };
assert.equal(courseResultBases([receipt([]),receipt([], { definition: newer })]).groups.length,2);
assert.equal(courseResultBases([], [definition]).questions[0]!.pre.points,null);
const dormant = { ...definition, questions: definition.questions.map(q => ({ ...q, analysisParticipation: [{ analysisType: "pre_post", enabled: false },{ analysisType: "pre_post_post", enabled: true }] })) };
assert.equal(courseResultBases([receipt([], { definition: dormant })]).questions.length,0);
const matrix = { ...definition, questions: [{ ...definition.questions[0]!, externalId: "row", sourceContext: { matrix: { externalId: "parent", text: "Opiniones", rowKey: "0", rowIndex: 0, rowLabel: "Opinión" } } }] };
assert.equal(courseResultBases([receipt([{ questionId: "parent", value: { Opinión: "Neutral" } }], { definition: matrix })]).questions[0]!.pre.points,6);
assert.equal(courseResultBases([receipt([{ questionId: "parent", value: ["Neutral"] }], { definition: matrix })]).sourcePendingReceipts,1);
const overflow = { ...definition, questions: [{ ...definition.questions[1]!, analysisScoring: [{ ...choice.analysisScoring![0]!, maxScore: 1e308 }] }] };
const huge = courseResultBases([receipt([{ questionId: "choice", value: "A" }], { definition: overflow }),receipt([{ questionId: "choice", value: "A" }], { definition: overflow })]);
assert.equal(huge.questions[0]!.pre.points,null); assert.equal(huge.questions[0]!.pre.valid,2);
console.log("course results selfcheck passed: ordered/inverse/correct rules, null exclusions, incomplete bases, matrix ambiguity and version isolation");

const { aggregateCourseQuestions } = await import("./course-aggregation.js");
const weights = [{ analysisType: "pre_post", categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Attitudes", weight: 100 }] }];
const weightedDefinition = { ...definition, analysisWeights: weights };
const qs = result.questions.map((question, i) => ({ ...question, factor: i ? 3 : 1 }));
let aggregates = aggregateCourseQuestions(qs,[weightedDefinition]);
assert.equal(aggregates.find(row => row.level === "subcategory")!.pre,62.5,"Normalize unequal maxima before averaging questions with weights 1:3");
assert.deepEqual(aggregates[0]!.preEffectiveWeights.map(item => item.weight),[25,75]);
assert.equal(aggregates.find(row => row.level === "index")!.pre,62.5); assert.equal(aggregates[0]!.post,null); assert.equal(aggregates[0]!.change,null);
const missing = structuredClone(qs); missing[1]!.pre.points = null; missing[1]!.pre.applicableMaximum = null;
aggregates = aggregateCourseQuestions(missing,[weightedDefinition]); assert.equal(aggregates[0]!.pre,100); assert.deepEqual(aggregates[0]!.preEffectiveWeights,[{ key: "scale", weight: 100 }]);
const zeroQs = structuredClone(qs); zeroQs.forEach(question => { question.pre.points = 0; question.post = { ...question.pre, points: question.pre.applicableMaximum }; });
aggregates = aggregateCourseQuestions(zeroQs,[weightedDefinition]); assert.equal(aggregates[0]!.pre,0); assert.equal(aggregates[0]!.post,100); assert.equal(aggregates[0]!.change,100);
const invalidWeights = { ...weightedDefinition, analysisWeights: [{ ...weights[0], categoryWeights: [{ category: "Learning", weight: 80 }] }] };
assert.equal(aggregateCourseQuestions(qs,[invalidWeights]).find(row => row.level === "index")!.pre,null);
const missingCategory = { ...weightedDefinition, analysisWeights: null }; assert.ok(aggregateCourseQuestions(qs,[missingCategory]).find(row => row.level === "category")!.issue);
const hierarchical = [
 { ...qs[0]!, id: "a", category: "A", subcategory: "one", factor: 1, pre: { ...qs[0]!.pre, points: 10, applicableMaximum: 10 } },
 { ...qs[0]!, id: "b", category: "A", subcategory: "two", factor: 1, pre: { ...qs[0]!.pre, points: 0, applicableMaximum: 10 } },
 { ...qs[0]!, id: "c", category: "B", subcategory: "three", factor: 1, pre: { ...qs[0]!.pre, points: 5, applicableMaximum: 10 } },
];
const hierarchyDefinition = { ...definition, analysisWeights: [{ analysisType: "pre_post", categoryWeights: [{ category: "A", weight: 60 },{ category: "B", weight: 40 }], subcategoryWeights: [{ category: "A", subcategory: "one", weight: 25 },{ category: "A", subcategory: "two", weight: 75 },{ category: "B", subcategory: "three", weight: 100 }] }] };
assert.equal(aggregateCourseQuestions(hierarchical,[hierarchyDefinition]).find(row => row.level === "index")!.pre,35);
assert.equal(aggregateCourseQuestions(huge.questions,[weightedDefinition])[0]!.pre,null);
assert.equal(aggregateCourseQuestions(qs,[weightedDefinition,{ ...weightedDefinition, id: "v2", version: 2 }]).filter(row => row.level === "index").length,2);
console.log("E5 aggregation passed: normalized maxima, unequal weights, proportional missing values, valid zero, hierarchy, null, configuration and version isolation");

const { complementaryResults } = await import("./complementary-results.js");
const primaryResult = { courseId: "course", name: "Edición", primaryDefinitionId: definition.id, aggregates: aggregateCourseQuestions(qs,[weightedDefinition]) } as import("@epi/shared").CourseResultsDto;
const followDefinition = { ...weightedDefinition, id: "follow", instrumentKind: "FOLLOW_UP" };
const followReceipts = [receipt([{questionId:"scale",value:"Neutral"},{questionId:"choice",value:"A"}],{definition:followDefinition,moment:"POST_POST"}),receipt([],{definition:followDefinition,excluded:true}),receipt([],{definition:followDefinition,contextPending:true}),receipt([],{definition:followDefinition,rawJsonData:{answers:[],unresolvedAnswers:[null]}})];
const untouched = JSON.stringify([primaryResult,followDefinition,followReceipts]);
const complement = complementaryResults(primaryResult,followDefinition,followReceipts);
assert.equal(complement.comparison.find(row=>row.subcategory === "Attitudes")!.followUp,80);
assert.equal(complement.comparison.find(row=>row.subcategory === "Attitudes")!.fromPre,17.5);
assert.equal(complement.comparison.find(row=>row.subcategory === "Attitudes")!.fromPost,null);
assert.equal(complement.receipts,1);assert.equal(complement.excluded,1);assert.equal(complement.contextPending,1);assert.equal(complement.sourcePending,1);
assert.equal(complement.distributions[0]!.options.find(option=>option.value === "Neutral")!.count,1);
assert.equal(JSON.stringify([primaryResult,followDefinition,followReceipts]),untouched);
const qualityResult = complementaryResults(primaryResult,{...followDefinition,instrumentKind:"CQS"},followReceipts);
assert.deepEqual(qualityResult.comparison,[]);assert.ok(qualityResult.pending[0]!.includes("pendiente"));assert.equal(qualityResult.distributions[0]!.answered,1);
assert.equal(complementaryResults(primaryResult,followDefinition,[]).comparison[0]!.followUp,null);
console.log("complement results passed: classification comparison, own distributions, nulls, exclusions and immutable sources");


const demographic = courseResultBases([
 receipt([{ questionId: "scale", value: "Neutral" }], { gender: "Hombre" }),
 receipt([{ questionId: "scale", value: "Neutral" }], { gender: "Mujer", moment: "POST" }),
 receipt([], { gender: "Otro" }), receipt([], { gender: "Prefiero no responder" }),
 receipt([], { gender: "Mujer", excluded: true }),
]);
assert.deepEqual(demographic.demographics, { pre: { men: 1, women: 0, other: 1, unknown: 1 }, post: { men: 0, women: 1, other: 0, unknown: 0 } });


const { addCourseStandardDeviations } = await import("./course-standard-deviation.js");
const withStatistics: ResultsDefinition = { ...definition, analysisWeights: [{
  analysisType: "pre_post", standardDeviation: "sample",
  categoryWeights: [{ category: "Learning", weight: 100 }],
  subcategoryWeights: [{ category: "Learning", subcategory: "Attitudes", weight: 100 }],
}] };
const statisticalReceipts: ResultsReceipt[] = [
  receipt([{ questionId: "scale", value: "Muy de acuerdo" }, { questionId: "choice", value: "A" }], { definition: withStatistics }),
  receipt([{ questionId: "scale", value: "Muy de acuerdo" }, { questionId: "choice", value: "B" }], { definition: withStatistics }),
  receipt([{ questionId: "choice", value: "B" }], { definition: withStatistics }),
  receipt([], { definition: withStatistics }),
  receipt([{ questionId: "choice", value: "A" }], { definition: withStatistics, excluded: true }),
  receipt([{ questionId: "choice", value: "A" }], { definition: withStatistics, contextPending: true }),
  receipt([], { definition: withStatistics, rawJsonData: { answers: [], unresolvedAnswers: [{}] } }),
  receipt([{ questionId: "scale", value: "Neutral" }, { questionId: "choice", value: "A" }], { definition: withStatistics, moment: "POST" }),
];
const statisticalOriginals = JSON.stringify(statisticalReceipts);
const statisticalBases = courseResultBases(statisticalReceipts, [withStatistics]);
const statisticalAggregates = aggregateCourseQuestions(statisticalBases.questions, [withStatistics]);
const sampleStats = addCourseStandardDeviations(statisticalAggregates, statisticalReceipts, [withStatistics]);
for (const aggregate of sampleStats) {
  assert.equal(aggregate.standardDeviation?.pre.n, 3);
  assert.equal(aggregate.standardDeviation?.pre.mean, 50);
  assert.equal(aggregate.standardDeviation?.pre.value, 50);
  assert.equal(aggregate.standardDeviation?.post.n, 1);
  assert.equal(aggregate.standardDeviation?.post.value, null);
}
const populationDefinition = { ...withStatistics, analysisWeights: [{ ...(withStatistics.analysisWeights as object[])[0], standardDeviation: "population" }] };
const populationStats = addCourseStandardDeviations(statisticalAggregates, statisticalReceipts, [populationDefinition]);
assert.ok(Math.abs(populationStats[0]!.standardDeviation!.pre.value! - Math.sqrt(5000 / 3)) < 1e-10);
assert.equal(populationStats[0]!.standardDeviation?.post.value, 0);
assert.equal(JSON.stringify(statisticalReceipts), statisticalOriginals);
assert.strictEqual(addCourseStandardDeviations(statisticalAggregates, statisticalReceipts, [definition]), statisticalAggregates);
const emptyStats = addCourseStandardDeviations(statisticalAggregates, [], [withStatistics]);
assert.deepEqual(emptyStats[0]?.standardDeviation?.pre, { n: 0, mean: null, value: null });
const splitDefinition: ResultsDefinition = { ...withStatistics, analysisWeights: [{
  analysisType: "pre_post", standardDeviation: "population",
  categoryWeights: [{ category: "Learning", weight: 100 }],
  subcategoryWeights: [{ category: "Learning", subcategory: "Attitudes", weight: 50 }, { category: "Learning", subcategory: "Knowledge", weight: 50 }],
}], questions: withStatistics.questions.map(question => question.externalId === "choice" ? { ...question, classification: { category: "Learning", subcategory: "Knowledge" } } : question) };
const splitReceipts = [
  receipt([{ questionId: "scale", value: "Muy de acuerdo" }, { questionId: "choice", value: "B" }], { definition: splitDefinition }),
  receipt([{ questionId: "scale", value: "Muy en desacuerdo" }, { questionId: "choice", value: "A" }], { definition: splitDefinition }),
];
const splitBases = courseResultBases(splitReceipts, [splitDefinition]);
const splitAggregates = addCourseStandardDeviations(aggregateCourseQuestions(splitBases.questions, [splitDefinition]), splitReceipts, [splitDefinition]);
assert.equal(splitAggregates.find(row => row.level === "category")?.standardDeviation?.pre.value, 5, "Category deviation uses total receipt scores, not summed subcategory deviations");
