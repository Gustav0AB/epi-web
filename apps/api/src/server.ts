import "./config/env.js"; // Validate env first
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { featuresRepository } from "./modules/features/features.repository.js";
import { FEATURES_REGISTRY } from "@epi/shared";

const app = createApp();

// Sync feature registry to DB so FK constraints never fail on user creation.
void featuresRepository
  .upsertMany(Object.values(FEATURES_REGISTRY))
  .catch((e) => console.error("Feature sync failed:", e));

const server = app.listen(env.PORT, () => {
  console.log(`🚀 API running on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received — graceful shutdown...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log("Database disconnected. Bye!");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
