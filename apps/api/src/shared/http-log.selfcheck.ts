import assert from "node:assert/strict";
import { errorMiddleware } from "../middlewares/error.middleware.js";
import { requestLog } from "./http-log.js";
import type { Request, Response } from "express";
const req = { method: "POST", route: { path: "/users/:id" }, url: "/users/private?token=secret", headers: { authorization: "secret" }, body: { password: "private" } } as unknown as Request;
const log = requestLog(req, { statusCode: 401 } as Response, "3.2");
assert.deepEqual(JSON.parse(log), { event: "http_request", method: "POST", route: "/users/:id", status: 401, durationMs: 3.2 });
assert(!/secret|private|password|authorization/i.test(log));
console.log("http log sanitization passed");

let status = 0;
let body: any;
const response = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; } } as unknown as Response;
const originalError = console.error;
const lines: string[] = [];
console.error = (line: string) => { lines.push(line); };
try {
  errorMiddleware(new Error("Prisma: private password/token"), req, response, () => {});
  assert.equal(status, 500);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert(!/Prisma|password|token|stack/.test(JSON.stringify(body)));
  assert.deepEqual(lines.map(line => JSON.parse(line)), [{ event: "http_error", status: 500 }]);
  errorMiddleware(Object.assign(new Error("Selecciona una categoría"), { statusCode: 400, code: "BAD_REQUEST" }), req, response, () => {});
  assert.equal(status, 400);
  assert.equal(body.error.code, "BAD_REQUEST");
  assert.equal(body.error.message, "Selecciona una categoría");
} finally { console.error = originalError; }
console.log("safe errors and stable codes passed");
