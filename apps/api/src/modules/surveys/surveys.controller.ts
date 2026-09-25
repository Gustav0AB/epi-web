import type { Request, Response, NextFunction } from "express";
import {
  apiSuccess,
  apiError,
  SurveyFiltersSchema,
  WeightInputSchema,
  ReportFiltersSchema,
  RegisterDefinitionSchema,
  UpdateQuestionSchema,
  CreateJotformAccountSchema,
  UpdateOpenQuestionsSummarySchema,
  HistoricalSubmissionsQuerySchema,
  HistoricalSubmissionsImportSchema,
} from "@epi/shared";
import { env } from "../../config/env.js";
import { surveysService, reprocessSurvey, analyzeOpenQuestion } from "./surveys.service.js";

export const surveysController = {
  async webhook(req: Request, res: Response, next: NextFunction) {
    if (env.JOTFORM_WEBHOOK_SECRET) {
      const provided = req.header("x-jotform-secret") ?? req.query.secret;
      if (provided !== env.JOTFORM_WEBHOOK_SECRET) {
        res.status(401).json(apiError("UNAUTHORIZED", "Invalid webhook secret"));
        return;
      }
    }
    try {
      const result = await surveysService.ingest(req.body);
      res.status(200).json(apiSuccess(result));
    } catch (err) {
      next(err);
    }
  },

  async reprocess(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id!;
      const result = await reprocessSurvey(id, req.user!.sub);
      res.json(apiSuccess({ submissionId: id, ...result }));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async listPending(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.listPending(req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },

  async listSurveys(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = SurveyFiltersSchema.parse(req.query);
      res.json(apiSuccess(await surveysService.listSurveys(filters, req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },

  async listDefinitions(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.listDefinitions(req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },

  async listGroups(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.listGroups()));
    } catch (err) {
      next(err);
    }
  },

  async listQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.getDefinitionQuestions(req.params.id!, req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },

  async setWeight(req: Request, res: Response, next: NextFunction) {
    try {
      const input = WeightInputSchema.parse(req.body);
      res.json(apiSuccess(await surveysService.setWeight(req.params.id!, input, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async deleteWeight(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.deleteWeight(req.params.id!, req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },

  async importWeights(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = typeof req.body === "string" ? req.body : "";
      if (!csv.trim()) {
        res.status(400).json(apiError("BAD_REQUEST", "CSV vacío o Content-Type no es text/csv"));
        return;
      }
      res.json(apiSuccess(await surveysService.importWeights(req.params.id!, csv, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async listUnregisteredForms(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.listUnregisteredForms()));
    } catch (err) {
      next(err);
    }
  },

  async listJotformForms(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.listJotformForms()));
    } catch (err) {
      next(err);
    }
  },

  async syncJotformForms(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.syncJotformForms()));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async previewFormQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.previewFormQuestions(req.params.formId!)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async listJotformAccounts(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.listJotformAccounts()));
    } catch (err) {
      next(err);
    }
  },

  async createJotformAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const input = CreateJotformAccountSchema.parse(req.body);
      res.status(201).json(apiSuccess(await surveysService.createJotformAccount(input)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async deleteJotformAccount(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.deleteJotformAccount(req.params.id!)));
    } catch (err) {
      next(err);
    }
  },

  async listHistoricalSubmissions(req: Request, res: Response, next: NextFunction) {
    try {
      const input = HistoricalSubmissionsQuerySchema.parse(req.query);
      res.json(apiSuccess(await surveysService.listHistoricalSubmissions(input, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async importHistoricalSubmissions(req: Request, res: Response, next: NextFunction) {
    try {
      const input = HistoricalSubmissionsImportSchema.parse(req.body);
      res.json(apiSuccess(await surveysService.importHistoricalSubmissions(input, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async listCatalogFields(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.listCatalogFields()));
    } catch (err) {
      next(err);
    }
  },

  async registerDefinition(req: Request, res: Response, next: NextFunction) {
    try {
      const input = RegisterDefinitionSchema.parse(req.body);
      res.status(201).json(apiSuccess(await surveysService.registerDefinition(input, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async updateQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const input = UpdateQuestionSchema.parse(req.body);
      res.json(apiSuccess(await surveysService.updateQuestion(req.params.id!, input, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async reprocessPending(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.reprocessPending(req.params.id!, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async updateOpenQuestionsSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const input = UpdateOpenQuestionsSummarySchema.parse(req.body);
      res.json(apiSuccess(await surveysService.updateOpenQuestionsSummary(req.params.id!, input, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async analyzeQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await analyzeOpenQuestion(req.params.id!, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  // Campana de notificaciones: cuántas respuestas llegaron desde `from`.
  async countSince(req: Request, res: Response, next: NextFunction) {
    try {
      const from = new Date(String(req.query.from ?? ""));
      if (Number.isNaN(from.getTime())) {
        res.status(400).json(apiError("BAD_REQUEST", "Parámetro 'from' inválido"));
        return;
      }
      res.json(apiSuccess({ count: await surveysService.countSince(from, req.user!.sub) }));
    } catch (err) {
      next(err);
    }
  },

  async groupSummary(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.groupSummary(req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },

  async completeGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const groupName = String(req.body?.groupName ?? "").trim();
      if (!groupName) {
        res.status(400).json(apiError("BAD_REQUEST", "groupName es requerido"));
        return;
      }
      res.json(apiSuccess(await surveysService.completeGroup(groupName, req.user!.sub)));
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async reportResults(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = ReportFiltersSchema.parse(req.query);
      res.json(apiSuccess(await surveysService.reportResults(filters, req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },

  async reportFilterOptions(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(apiSuccess(await surveysService.reportFilterOptions(req.user!.sub)));
    } catch (err) {
      next(err);
    }
  },
};
