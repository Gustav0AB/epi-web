import assert from "node:assert/strict";
import { jotformClient } from "./jotform-client.js";
import { syncJotformForms } from "./surveys.service.js";
import { surveysRepository } from "./surveys.repository.js";

const originalFetch = globalThis.fetch;
const originalAccounts = surveysRepository.listJotformAccounts;
const originalUpsert = surveysRepository.upsertJotformForms;
const form = (id: string) => ({ id, title: `Form ${id}`, status: "ENABLED", labelIds: [], createdAt: null, updatedAt: null, submissionCount: null, lastSubmission: null, url: null });
const response = (content: unknown, responseCode = 200) => Response.json({ responseCode, content });
try {
  globalThis.fetch = async () => response({ conditions: "[]", arbitrary: "preserved" });
  assert.deepEqual(await jotformClient.getFormProperties("form", "test-key"), { conditions: "[]", arbitrary: "preserved" });
  globalThis.fetch = async () => response([]);
  await assert.rejects(() => jotformClient.getFormProperties("form", "test-key"), { statusCode: 502 });
  const sourceQuestions = { "1": { type: "control_head" }, "2": { name: "matrix", text: "Matriz", type: "control_matrix", options: { rows: ["A"] }, custom: "preserved" } };
  globalThis.fetch = async () => response(sourceQuestions);
  assert.deepEqual(await jotformClient.getFormQuestionSource("form", "test-key"), sourceQuestions);
  assert.deepEqual(await jotformClient.getFormQuestions("form", "test-key"), [
    { ...sourceQuestions["1"], qid: "1", text: "" },
    { ...sourceQuestions["2"], qid: "2" },
  ]);
  globalThis.fetch = async () => response([]);
  assert.deepEqual(await jotformClient.getFormQuestionSource("form", "test-key"), []);
  assert.deepEqual(await jotformClient.getFormQuestions("form", "test-key"), []);
  globalThis.fetch = async () => new Response('{"responseCode":200,"content":{"1":{"type":"control_new","custom":1e309}}}');
  await assert.rejects(() => jotformClient.getFormQuestionSource("form", "test-key"), { statusCode: 502 });
  globalThis.fetch = async () => response({ "1": { type: 123 } });
  await assert.rejects(() => jotformClient.getFormQuestions("form", "test-key"), { statusCode: 502 });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/user/labels");
    assert.equal(url.searchParams.get("apiKey"), "test-key");
    return response({ root: { id: "r", name: "Root", color: "discard", sublabels: [{ id: "c", name: "Child", sublabels: { leaf: { id: "l", name: "Leaf" } } }] }, duplicate: { id: "c", name: "Child" } });
  };
  assert.deepEqual(await jotformClient.listLabels("test-key"), [{ id: "c", name: "Child" }, { id: "l", name: "Leaf" }, { id: "r", name: "Root" }]);
  globalThis.fetch = async () => response([]);
  assert.deepEqual(await jotformClient.listLabels("test-key"), []);
  for (const content of [[], {}, { id: "root", owner: "test", sublabels: [] }]) {
    globalThis.fetch = async () => response(content);
    assert.deepEqual(await jotformClient.listLabels("test-key"), []);
  }
  globalThis.fetch = async () => response({ id: "root", owner: "test", sublabels: [
    { id: "a", name: " Evaluation ", sublabels: [{ id: "b", name: "Local", sublabels: [] }] },
  ] });
  assert.deepEqual(await jotformClient.listLabels("test-key"), [{ id: "a", name: "Evaluation" }, { id: "b", name: "Local" }]);
  globalThis.fetch = async () => response({ id: "root", sublabels: [{ id: "bad" }] });
  await assert.rejects(() => jotformClient.listLabels("test-key"), { statusCode: 502 });
  for (const labels of [[{ id: "x" }], [{ id: "x", name: "A" }, { id: "x", name: "B" }], [{ id: "x", name: "A", sublabels: [{ name: "Bad" }] }]]) {
    globalThis.fetch = async () => response(labels);
    await assert.rejects(() => jotformClient.listLabels("test-key"), { statusCode: 502 });
  }
  globalThis.fetch = async () => response([], 403);
  await assert.rejects(() => jotformClient.listLabels("test-key"), { statusCode: 502 });
  const offsets: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/user/forms");
    assert.equal(url.searchParams.get("apiKey"), "test-key");
    assert.equal(url.searchParams.get("limit"), "100");
    assert.equal(url.searchParams.get("orderby"), "id");
    const offset = url.searchParams.get("offset")!;
    offsets.push(offset);
    // Short pages and overlap must not truncate or duplicate the catalog.
    return response(offset === "0" ? [form("1"), form("2")] : offset === "2" ? [form("2"), form("3")] : []);
  };
  assert.deepEqual(await jotformClient.listForms("test-key"), [form("1"), form("2"), form("3")]);
  assert.deepEqual(offsets, ["0", "2", "4"]);
  globalThis.fetch = async () => response([]);
  assert.deepEqual(await jotformClient.listForms("test-key"), []);

  let metadataCalls = 0;
  globalThis.fetch = async () => response(++metadataCalls === 1 ? [{ id: "meta", title: "Metadata", status: "ENABLED", created_at: "2026-11-01 12:30:00", updated_at: "2026-11-02 09:00:00", count: "0", last_submission: null, url: "https://form.jotform.com/meta", theme: "discard" }] : []);
  assert.deepEqual(await jotformClient.listForms("test-key"), [{ ...form("meta"), title: "Metadata", createdAt: "2026-11-01 12:30:00", updatedAt: "2026-11-02 09:00:00", submissionCount: 0, url: "https://form.jotform.com/meta" }]);
  for (const invalid of [{ count: -1 }, { count: "1.5" }, { count: "" }, { count: 2147483648 }, { url: "javascript:alert(1)" }]) {
    globalThis.fetch = async () => response([{ ...form("bad"), ...invalid }]);
    await assert.rejects(() => jotformClient.listForms("test-key"), { statusCode: 502 });
  }
  let labeledCalls = 0;
  globalThis.fetch = async () => response(++labeledCalls === 1 ? [{ ...form("labeled"), folders: " a, b,a, ,c " }] : []);
  assert.deepEqual((await jotformClient.listForms("test-key"))[0]!.labelIds, ["a", "b", "c"]);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response([form("1")]); };
  await assert.rejects(() => jotformClient.listForms("test-key"), { statusCode: 502 });
  assert.equal(calls, 2);
  for (const badResponse of [
    () => response([], 429),
    () => response([{ id: "missing-fields" }]),
    () => new Response("unavailable", { status: 503 }),
  ]) {
    globalThis.fetch = async () => badResponse();
    await assert.rejects(() => jotformClient.listForms("test-key"), { statusCode: 502 });
  }
  globalThis.fetch = async () => response({}, 403);
  await assert.rejects(() => jotformClient.getFormQuestions("form", "test-key"), { statusCode: 502 });
  globalThis.fetch = async () => response([], 429);
  await assert.rejects(() => jotformClient.listSubmissions("form", "test-key", {}), { statusCode: 502 });


  const submission = (id: string) => ({ id, form_id: "form", created_at: "2026-01-10 12:00:00", answers: { matrix: { answer: { row: [1, 2] } } } });
  const historical = Array.from({ length: 1205 }, (_, i) => submission(String(i)));
  const submissionOffsets: number[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/form/form/submissions");
    assert.equal(url.searchParams.get("limit"), "1000");
    assert.equal(url.searchParams.get("apiKey"), "test-key");
    assert.deepEqual(JSON.parse(url.searchParams.get("filter")!), { "created_at:gt": "2026-01-01 00:00:00", "created_at:lt": "2026-01-31 23:59:59" });
    const offset = Number(url.searchParams.get("offset"));
    submissionOffsets.push(offset);
    return response(historical.slice(offset, offset + 500));
  };
  assert.deepEqual(await jotformClient.listSubmissions("form", "test-key", { from: "2026-01-01", to: "2026-01-31" }), historical);
  assert.deepEqual(submissionOffsets, [0, 500, 1000, 1205]);
  calls = 0;
  globalThis.fetch = async () => response([ [submission("1"), submission("2")], [submission("2"), submission("3")], [] ][calls++]);
  assert.deepEqual((await jotformClient.listSubmissions("form", "test-key", {})).map(s => s.id), ["1", "2", "3"]);
  globalThis.fetch = async () => response([]);
  assert.deepEqual(await jotformClient.listSubmissions("form", "test-key", {}), []);
  calls = 0;
  globalThis.fetch = async () => { calls++; return response([submission("same")]); };
  await assert.rejects(() => jotformClient.listSubmissions("form", "test-key", {}), { statusCode: 502 });
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? response([submission("first")]) : new Response("failure", { status: 503 });
  await assert.rejects(() => jotformClient.listSubmissions("form", "test-key", {}), { statusCode: 502 });
  for (const filters of [{ limit: 0 }, { limit: 1.5 }, { offset: -1 }]) {
    await assert.rejects(() => jotformClient.listSubmissions("form", "test-key", filters), { statusCode: 400 });
  }
  const pageOffsets: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); pageOffsets.push(url.searchParams.get("offset")!);
    return response([submission("page-only")]);
  };
  assert.deepEqual(await jotformClient.listSubmissionPage("form", "test-key", { offset: 500 }), [submission("page-only")]);
  assert.deepEqual(pageOffsets, ["500"], "The page API makes exactly one request");
  globalThis.fetch = async () => response([{ ...submission("foreign"), form_id: "other-form" }]);
  await assert.rejects(() => jotformClient.listSubmissionPage("form", "test-key", {}), { statusCode: 502 });
  globalThis.fetch = async () => response([submission("")]);
  await assert.rejects(() => jotformClient.listSubmissionPage("form", "test-key", {}), { statusCode: 502 });
  surveysRepository.listJotformAccounts = (async () => [{ id: "account", apiKey: "test-key", name: "Test", createdAt: new Date(), updatedAt: new Date() }]) as unknown as typeof originalAccounts;
  let writes = 0;
  surveysRepository.upsertJotformForms = async (forms) => {
    writes++;
    assert.deepEqual(forms, [{ ...form("1"), accountId: "account" }]);
    return { added: ["1"], total: forms.length };
  };
  calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? response([form("1")]) : new Response("unavailable", { status: 503 });
  await assert.rejects(() => syncJotformForms("account"), { statusCode: 502 });
  assert.equal(writes, 0, "A failed later page must not persist a partial catalog");
  calls = 0;
  globalThis.fetch = async () => response(++calls === 1 ? [form("1")] : []);
  assert.deepEqual(await syncJotformForms("account"), { added: ["1"], total: 1 });
  assert.equal(writes, 1);
  console.log("✓ Jotform pagination, response errors and complete sync self-check passed");
} finally {
  globalThis.fetch = originalFetch;
  surveysRepository.listJotformAccounts = originalAccounts;
  surveysRepository.upsertJotformForms = originalUpsert;
}
