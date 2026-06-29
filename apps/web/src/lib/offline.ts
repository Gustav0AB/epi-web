import { db } from "./db";
import type { User } from "@epi/shared";

// Matches /api/users or /api/users?page=1&...
const USER_LIST_RE = /^\/api\/users(\?.*)?$/;
// Matches /api/users/:id
const USER_BY_ID_RE = /^\/api\/users\/([^/?]+)$/;

// Called by apiClient for any GET while offline.
// Returns cached data from IndexedDB — ignores pagination params and returns everything
// so the caller gets the full local dataset.
export async function resolveOfflineGet(path: string): Promise<unknown> {
  if (USER_LIST_RE.test(path)) {
    return db.users.orderBy("createdAt").reverse().toArray();
  }
  const idMatch = path.match(USER_BY_ID_RE);
  if (idMatch?.[1]) {
    return db.users.get(idMatch[1]);
  }
  throw new Error(`No offline resolver for GET ${path}`);
}

// Called by apiClient for POST/PATCH/DELETE while offline.
// Applies the change optimistically to IndexedDB and queues the mutation for later sync.
export async function applyOptimisticWrite(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const now = new Date().toISOString();

  if (method === "POST" && USER_LIST_RE.test(path)) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const user: User = {
      ...(body as Omit<User, "id" | "createdAt" | "updatedAt">),
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };
    await db.users.add(user);
    await db.mutationQueue.add({ method, path, body, createdAt: now, tempId });
    return user;
  }

  const idMatch = path.match(USER_BY_ID_RE);
  if (idMatch?.[1]) {
    const id = idMatch[1];

    if (method === "PATCH") {
      const existing = await db.users.get(id);
      if (existing) {
        const updated: User = { ...existing, ...(body as Partial<User>), updatedAt: now };
        await db.users.put(updated);
        await db.mutationQueue.add({ method, path, body, createdAt: now });
        return updated;
      }
    }

    if (method === "DELETE") {
      await db.users.delete(id as string);
      await db.mutationQueue.add({ method, path, createdAt: now });
      return undefined;
    }
  }

  throw new Error(`No offline handler for ${method} ${path}`);
}
