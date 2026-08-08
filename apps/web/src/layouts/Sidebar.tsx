import { useState } from "react";
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
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import QuestionAnswerOutlinedIcon from "@mui/icons-material/QuestionAnswerOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import LogoutIcon from "@mui/icons-material/Logout";

type NavItem = {
  to: string;
  label: I18nKey;
  icon: React.ReactNode;
} & (
  | { kind: "functionality"; featureKey: string }
  | { kind: "report_template"; templateKey: string }
  | { kind: "user_management" }
  | { kind: "system_admin" }
  | { kind: "admin_tier" }
);

const navItems: NavItem[] = [
  {
    to: "/home",
    label: "nav.home",
    kind: "functionality",
    featureKey: FEATURE_KEYS.HOME,
    icon: <HomeOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/surveys",
    label: "nav.surveys",
    kind: "functionality",
    featureKey: FEATURE_KEYS.SURVEYS,
    icon: <PollOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/scoring",
    label: "nav.scoring",
    kind: "functionality",
    featureKey: FEATURE_KEYS.SCORING,
    icon: <TuneOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/open-questions",
    label: "nav.openQuestions",
    kind: "functionality",
    featureKey: FEATURE_KEYS.OPEN_QUESTIONS,
    icon: <QuestionAnswerOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/reports",
    label: "nav.reports",
    kind: "report_template",
    templateKey: "reports",
    icon: <AssessmentOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/users",
    label: "nav.users",
    kind: "user_management",
    icon: <PeopleOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/organizations",
    label: "nav.organizations",
    kind: "system_admin",
    icon: <CorporateFareOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/sites",
    label: "nav.sites",
    kind: "admin_tier",
    icon: <PlaceOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/categories",
    label: "nav.categories",
    kind: "admin_tier",
    icon: <CategoryOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/report-assignments",
    label: "nav.reportAssignments",
    kind: "admin_tier",
    icon: <AssignmentOutlinedIcon className="shrink-0" />,
  },
  {
    to: "/audit-log",
    label: "nav.auditLog",
    kind: "system_admin",
    icon: <HistoryOutlinedIcon className="shrink-0" />,
  },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const currentUser = useAuthStore((s) => s.currentUser);
  const { t } = useI18n();

  const isAdminTier = currentUser?.role === "system_admin" || currentUser?.role === "org_admin";
  const featureKeys = currentUser?.featureKeys ?? [];
  const reportTemplateKeys = currentUser?.reportTemplateKeys ?? [];

  const visibleItems = navItems.filter((item) => {
    if (item.kind === "system_admin") return currentUser?.role === "system_admin";
    if (item.kind === "admin_tier") return isAdminTier;
    if (item.kind === "user_management") return isAdminTier;
    if (item.kind === "functionality") return isAdminTier || featureKeys.includes(item.featureKey);
    return isAdminTier || reportTemplateKeys.includes(item.templateKey);
  });

  return (
    <aside
      className={[
        "flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200",
        expanded ? "w-56" : "w-16",
      ].join(" ")}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-gray-200 px-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          {expanded ? <MenuOpenIcon /> : <MenuIcon />}
        </button>
        {expanded && (
          <span className="ml-3 text-base font-semibold text-gray-900">
            EPI
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                title={!expanded ? t(item.label) : undefined}
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
                {expanded && <span>{t(item.label)}</span>}
              </NavLink>
            </li>
          ))}
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
