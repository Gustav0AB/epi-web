import { useEffect } from "react";
import { useUsersStore } from "../../store/users.store";

export function UserList() {
  const { users, meta, isLoading, error, fetchUsers } = useUsersStore();

  useEffect(() => {
    void fetchUsers({ page: 1, pageSize: 20 });
  }, [fetchUsers]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Users{meta ? ` (${meta.total})` : ""}
        </h2>
      </div>

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {users.map((user) => (
          <li key={user.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                user.role === "admin"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {user.role}
            </span>
          </li>
        ))}
      </ul>

      {meta && meta.totalPages > 1 && (
        <p className="text-center text-sm text-gray-500">
          Page {meta.page} of {meta.totalPages}
        </p>
      )}
    </div>
  );
}
