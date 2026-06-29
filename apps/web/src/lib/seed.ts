import { db } from "./db";
import type { User, PaginationMeta } from "@epi/shared";

const PAGE_SIZE = 200;

async function fetchUsersPage(
  token: string,
  page: number
): Promise<{ data: User[]; meta: PaginationMeta }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  const res = await fetch(`/api/users?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "Failed to fetch users");
  return { data: json.data as User[], meta: json.meta as PaginationMeta };
}

// Fetches all pages and writes them to IndexedDB.
// Called once after login while the connection is guaranteed to be up.
export async function seedDatabase(token: string): Promise<void> {
  const first = await fetchUsersPage(token, 1);
  const allUsers: User[] = [...first.data];

  if (first.meta.totalPages > 1) {
    const pages = await Promise.all(
      Array.from({ length: first.meta.totalPages - 1 }, (_, i) =>
        fetchUsersPage(token, i + 2)
      )
    );
    pages.forEach(({ data }) => allUsers.push(...data));
  }

  await db.users.bulkPut(allUsers);
}

// Wipes all local data. Call on logout.
export async function clearDatabase(): Promise<void> {
  await Promise.all([db.users.clear(), db.mutationQueue.clear()]);
}
