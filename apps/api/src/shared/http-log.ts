import type { Request, Response } from "express";

export function requestLog(req: Request, res: Response, durationMs: string | undefined) {
  // Route patterns exclude user IDs, query strings and all submitted data.
  const route = typeof req.route?.path === "string" ? req.route.path : "unmatched";
  return JSON.stringify({ event: "http_request", method: req.method, route, status: res.statusCode, durationMs: Number(durationMs ?? 0) });
}
export function logServerError(status: number) {
  console.error(JSON.stringify({ event: "http_error", status }));
}
