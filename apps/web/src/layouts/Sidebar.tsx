import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { FEATURE_KEYS } from "@epi/shared";
import { useAuthStore } from "../store/auth.store";
import { useI18n, type I18nKey } from "../lib/i18n";
import MenuIcon from "@mui/icons-material/Menu";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CorporateFareOutlinedIcon from "@mui/icons-material/CorporateFareOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import LogoutIcon from "@mui/icons-material/Logout";

type NavItem = {
  to: string;
  label: I18nKey;
  icon: React.ReactNode;
} & (
  | { kind: "published" }
  | { kind: "functionality"; featureKey: string }
  | { kind: "report_template"; templateKey: string }
  | { kind: "functionality_any"; featureKeys: string[] }
  | { kind: "user_management" }
  | { kind: "system_admin" }
  | { kind: "admin_tier" }
);

const navItems: NavItem[] = [
  { to: "/home", label: "nav.home", kind: "functionality", featureKey: FEATURE_KEYS.HOME, icon: <HomeOutlinedIcon className="shrink-0" /> },
  { to: "/courses", label: "nav.courses", kind: "functionality_any", featureKeys: [FEATURE_KEYS.SURVEYS, FEATURE_KEYS.OPEN_QUESTIONS], icon: <PollOutlinedIcon className="shrink-0" /> },
  { to: "/instruments", label: "nav.instruments", kind: "functionality", featureKey: FEATURE_KEYS.SCORING, icon: <TuneOutlinedIcon className="shrink-0" /> },
  { to: "/reports", label: "nav.reports", kind: "published", icon: <AssessmentOutlinedIcon className="shrink-0" /> },
  { to: "/users", label: "nav.users", kind: "user_management", icon: <PeopleOutlinedIcon className="shrink-0" /> },
  { to: "/organization-management", label: "nav.organizationManagement", kind: "admin_tier", icon: <CorporateFareOutlinedIcon className="shrink-0" /> },
  { to: "/settings", label: "nav.settings", kind: "system_admin", icon: <SettingsSuggestOutlinedIcon className="shrink-0" /> },
  { to: "/audit-log", label: "nav.auditLog", kind: "system_admin", icon: <HistoryOutlinedIcon className="shrink-0" /> },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(true);
  const logout = useAuthStore((s) => s.logout);
  const currentUser = useAuthStore((s) => s.currentUser);
  const initCurrentUser = useAuthStore((s) => s.initCurrentUser);
  useEffect(() => { void initCurrentUser(); }, [initCurrentUser]);
  const { t } = useI18n();

  const isAdminTier =
    currentUser?.role === "system_admin" || currentUser?.role === "org_admin";
  const featureKeys = currentUser?.featureKeys ?? [];
  const reportTemplateKeys = currentUser?.reportTemplateKeys ?? [];

  const canSee = (item: NavItem) => {
    if (item.kind === "published") return !!currentUser;
    if (item.kind === "system_admin")
      return currentUser?.role === "system_admin";
    if (item.kind === "admin_tier") return isAdminTier;
    if (item.kind === "user_management") return isAdminTier;
    if (item.kind === "functionality_any") return isAdminTier || item.featureKeys.some(key => featureKeys.includes(key));
    if (item.kind === "functionality")
      return isAdminTier || featureKeys.includes(item.featureKey);
    return isAdminTier || reportTemplateKeys.includes(item.templateKey);
  };
  const visibleItems = navItems.filter(canSee);

  return (
    <aside
      className={[
        "flex h-screen shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-200",
        expanded ? "w-56" : "w-16",
      ].join(" ")}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-gray-200 px-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          {expanded ? <MenuOpenIcon /> : <MenuIcon />}
        </button>
        {expanded && (
          <span className="ml-3 text-base font-semibold text-gray-900">
            SGE
          </span>
        )}
      </div>

      <nav aria-label={t("nav.navigation")} className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {visibleItems.map(item => <li key={item.to}>
            <NavLink to={item.to} title={!expanded ? t(item.label) : undefined} className={({ isActive }) => [
              "flex items-center rounded-md px-2.5 py-2.5 text-base font-medium transition-colors",
              expanded ? "gap-3" : "justify-center",
              isActive ? "bg-primary-muted text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
            ].join(" ")}>
              {item.icon}{expanded && <span>{t(item.label)}</span>}
            </NavLink>
          </li>)}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-gray-200 p-2">
        <button
          onClick={logout}
          title={!expanded ? t("header.logout") : undefined}
          className={[
            "flex w-full items-center rounded-md px-2.5 py-2.5 text-base font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900",
            expanded ? "gap-3" : "justify-center",
          ].join(" ")}
        >
          <LogoutIcon className="shrink-0" />
          {expanded && <span>{t("header.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
