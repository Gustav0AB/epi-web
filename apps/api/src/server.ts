import { ensureDefaultAdmin } from "./db/default-admin.js";
import { startAssistantMigrationWorker } from "./modules/surveys/assistant-migration.worker.js";
import "./config/env.js"; // Validate env first
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { featuresRepository } from "./modules/features/features.repository.js";
import { FEATURES_REGISTRY } from "@epi/shared";

async function start() {
  await ensureDefaultAdmin();
  const app = createApp();
  void featuresRepository.upsertMany(Object.values(FEATURES_REGISTRY))
    .catch(() => console.error(JSON.stringify({ event: "feature_sync_failed" })));
  const stopAssistantWorker = startAssistantMigrationWorker();
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 API running on http://localhost:${env.PORT}`);
  });
  async function shutdown(signal: string) {
    console.log(`\n${signal} received — graceful shutdown...`);
    const workerStopped = stopAssistantWorker();
    server.close(async () => {
      await workerStopped;
      await prisma.$disconnect();
      console.log("Database disconnected. Bye!");
      process.exit(0);
    });
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
void start().catch(async (error: unknown) => {
  console.error("No se pudo iniciar la API:", error instanceof Error ? error.message : "error de inicialización");
  await prisma.$disconnect();
  process.exitCode = 1;
});
