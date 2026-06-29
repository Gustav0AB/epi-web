import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import type { User } from "@epi/shared";
import type { QueuedMutation } from "./db";

// Re-export db so callers only need to import from one place
export { db };

export function useDbUsers(): User[] {
  return useLiveQuery(() => db.users.orderBy("createdAt").toArray(), []) ?? [];
}

export function useDbUser(id: string): User | undefined {
  return useLiveQuery(() => db.users.get(id), [id]);
}

export function useDbMutationQueue(): QueuedMutation[] {
  return useLiveQuery(() => db.mutationQueue.orderBy("createdAt").toArray(), []) ?? [];
}
