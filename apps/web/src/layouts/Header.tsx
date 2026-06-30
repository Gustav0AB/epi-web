import { useEffect } from "react";
import { useAuthStore } from "../store/auth.store";

export function Header() {
  const { currentUser, initCurrentUser } = useAuthStore();

  useEffect(() => {
    void initCurrentUser();
  }, [initCurrentUser]);

  const initials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <LeafIcon />
        <span className="text-sm font-semibold text-gray-900">
          Ecology Project International
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button
          title="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <BellIcon />
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
            title={currentUser?.email}
          >
            {initials}
          </span>
          <span className="text-sm font-medium text-gray-800">
            {currentUser?.name ?? "—"}
          </span>
        </div>
      </div>
    </header>
  );
}

function LeafIcon() {
  return (
    <svg
      className="h-6 w-6 text-primary"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 008 20c9 0 15-8 11-16-.77.91-1.5 1.73-2 4z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
