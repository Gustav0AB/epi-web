import { useState } from "react";
import { NavLink } from "react-router-dom";
import { FEATURE_KEYS } from "@epi/shared";
import { useAuthStore } from "../store/auth.store";

type NavItem = {
  to: string;
  label: string;
  featureKey: string | null; // null = always visible
  adminOnly?: boolean;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    to: "/home",
    label: "Home",
    featureKey: FEATURE_KEYS.HOME,
    icon: (
      <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-9 5v6h4v-6m-4 0H9m6 0h-2" />
      </svg>
    ),
  },
  {
    to: "/components",
    label: "Components",
    featureKey: FEATURE_KEYS.COMPONENTS,
    icon: (
      <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
      </svg>
    ),
  },
  {
    to: "/users",
    label: "Users",
    featureKey: FEATURE_KEYS.USERS_MANAGEMENT,
    adminOnly: true,
    icon: (
      <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6zM3 20v-2a3 3 0 013-3" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const currentUser = useAuthStore((s) => s.currentUser);

  const isAdmin = currentUser?.role === "admin";
  const userFeatureKeys = currentUser?.featureKeys ?? [];

  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (isAdmin) return true;
    if (item.featureKey === null) return true;
    return userFeatureKeys.includes(item.featureKey);
  });

  return (
    <aside
      className={[
        "flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200",
        expanded ? "w-56" : "w-16",
      ].join(" ")}
    >
      {/* Header — toggle button */}
      <div className="flex h-14 shrink-0 items-center border-b border-gray-200 px-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          {expanded ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
        {expanded && (
          <span className="ml-3 text-base font-semibold text-gray-900">Epi Web</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                title={!expanded ? item.label : undefined}
                className={({ isActive }) =>
                  [
                    "flex items-center rounded-md px-2.5 py-2.5 text-base font-medium transition-colors",
                    expanded ? "gap-3" : "justify-center",
                    isActive
                      ? "bg-primary-muted text-primary"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  ].join(" ")
                }
              >
                {item.icon}
                {expanded && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sign out */}
      <div className="shrink-0 border-t border-gray-200 p-2">
        <button
          onClick={logout}
          title={!expanded ? "Sign out" : undefined}
          className={[
            "flex w-full items-center rounded-md px-2.5 py-2.5 text-base font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900",
            expanded ? "gap-3" : "justify-center",
          ].join(" ")}
        >
          <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
          {expanded && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
