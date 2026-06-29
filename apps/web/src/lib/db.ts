import Dexie, { type EntityTable } from "dexie";
import type { User } from "@epi/shared";

// Represents a write operation that failed while offline and needs to be replayed
export type QueuedMutation = {
  id?: number; // auto-incremented by Dexie
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  createdAt: string; // ISO timestamp
  // For POST mutations: the temporary local ID we gave the record so sync can replace it
  tempId?: string;
};

class EpiDatabase extends Dexie {
  users!: EntityTable<User, "id">;
  mutationQueue!: EntityTable<QueuedMutation, "id">;

  constructor() {
    super("epi-db");

    this.version(1).stores({
      // Index the fields you query or sort by; "id" is the primary key
      users: "id, email, role, createdAt",
      // "++id" = auto-increment integer primary key
      mutationQueue: "++id, method, path, createdAt",
    });
  }
}

export const db = new EpiDatabase();
