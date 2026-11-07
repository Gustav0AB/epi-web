import { reconcileDueAssistantImport } from "./assistant-migration.service.js";

export function startAssistantMigrationWorker() {
  let pending: Promise<void> | null = null;
  const tick = () => {
    if (pending) return;
    pending = reconcileDueAssistantImport()
      .catch(() => { console.warn("Assistant import scheduler unavailable; retrying on the next tick"); })
      .finally(() => { pending = null; });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await pending; };
}
