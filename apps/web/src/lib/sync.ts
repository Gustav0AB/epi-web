import { db } from "./db";
import { seedDatabase } from "./seed";
import type { User } from "@epi/shared";

function getToken(): string {
  try {
    const raw = localStorage.getItem("auth-storage");
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.state?.token ?? "";
  } catch {
    return "";
  }
}

async function flushMutationQueue(): Promise<void> {
  const token = getToken();
  if (!token) return;

  const mutations = await db.mutationQueue.orderBy("createdAt").toArray();
  if (mutations.length === 0) return;

  for (const mutation of mutations) {
    try {
      const res = await fetch(mutation.path, {
        method: mutation.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        ...(mutation.body != null ? { body: JSON.stringify(mutation.body) } : {}),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Sync failed");

      // POST created a real record — swap out the temp local record for the real one
      if (mutation.method === "POST" && mutation.tempId) {
        const realRecord = json.data as User;
        await db.users.delete(mutation.tempId);
        await db.users.put(realRecord);
      }

      await db.mutationQueue.delete(mutation.id!);
    } catch {
      // Stop on first failure to preserve ordering — will retry on the next online event
      break;
    }
  }

  // Re-seed to pull in any changes other clients made while we were offline
  await seedDatabase(token);
}

// Call once at app startup. Registers the online listener for the lifetime of the session.
export function initSync(): void {
  window.addEventListener("online", () => {
    void flushMutationQueue();
  });
}
