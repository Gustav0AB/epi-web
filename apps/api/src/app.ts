import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { featuresRouter } from "./modules/features/features.routes.js";
import { surveysRouter, webhooksRouter, reportsRouter } from "./modules/surveys/surveys.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { assignedReportsRouter } from "./modules/reports-assignment/assigned-reports.routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { apiError } from "@epi/shared";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  app.use(express.json());
  app.use(express.text({ type: "text/csv", limit: "1mb" })); // import CSV de ponderaciones
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/features", featuresRouter);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/surveys", surveysRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/reports", assignedReportsRouter); // /assigned, /assignments*, /:id/data
  app.use("/api", catalogRouter); // /organizations, /sites, /categories
  app.use("/api", auditRouter); // /audit-logs

  app.use((_req, res) => {
    res.status(404).json(apiError("NOT_FOUND", "Route not found"));
  });

  app.use(errorMiddleware);

  return app;
}
