import { SidebarMenu, type SidebarMenuGroup } from "./SidebarMenu";
import { FEATURE_KEYS } from "@epi/shared";
import { useAuthStore } from "../store/auth.store";
import type { I18nKey } from "../lib/i18n";

import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CorporateFareOutlinedIcon from "@mui/icons-material/CorporateFareOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import QuestionAnswerOutlinedIcon from "@mui/icons-material/QuestionAnswerOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";

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

type NavGroup = SidebarMenuGroup & { items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "navGroup.main",
    collapsible: false,
    items: [
      {
        to: "/home",
        label: "nav.home",
        kind: "functionality",
        featureKey: FEATURE_KEYS.HOME,
        icon: <HomeOutlinedIcon className="shrink-0" />,
      },
    ],
  },
  {
    label: "navGroup.surveys",
    collapsible: true,
    items: [
      {
        to: "/surveys",
        label: "nav.surveys",
        kind: "functionality",
        featureKey: FEATURE_KEYS.SURVEYS,
        icon: <PollOutlinedIcon className="shrink-0" />,
      },
      {
        to: "/survey-groups",
        label: "nav.surveyGroups",
        kind: "functionality",
        featureKey: FEATURE_KEYS.SURVEYS,
        icon: <SearchOutlinedIcon className="shrink-0" />,
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
    ],
  },
  {
    label: "navGroup.reports",
    collapsible: true,
    items: [
      {
        to: "/reports",
        label: "nav.reports",
        kind: "report_template",
        templateKey: "reports",
        icon: <AssessmentOutlinedIcon className="shrink-0" />,
      },
      {
        to: "/report-assignments",
        label: "nav.reportAssignments",
        kind: "admin_tier",
        icon: <AssignmentOutlinedIcon className="shrink-0" />,
      },
    ],
  },
  {
    label: "navGroup.administration",
    collapsible: true,
    items: [
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
    ],
  },
  {
    label: "navGroup.configuration",
    collapsible: true,
    items: [
      {
        to: "/survey-settings",
        label: "nav.surveySettings",
        kind: "admin_tier",
        icon: <SettingsSuggestOutlinedIcon className="shrink-0" />,
      },
  {
    to: "/jotform-accounts",
    label: "nav.jotformAccounts",
    kind: "system_admin",
        icon: <VpnKeyOutlinedIcon className="shrink-0" />,
      },
    ],
  },
  {
    label: "navGroup.system",
    collapsible: true,
    items: [
      {
        to: "/audit-log",
        label: "nav.auditLog",
        kind: "system_admin",
        icon: <HistoryOutlinedIcon className="shrink-0" />,
      },
    ],
  },
];

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  const currentUser = useAuthStore((s) => s.currentUser);

  const isAdminTier =
    currentUser?.role === "system_admin" || currentUser?.role === "org_admin";
  const featureKeys = currentUser?.featureKeys ?? [];
  const reportTemplateKeys = currentUser?.reportTemplateKeys ?? [];

  const canSee = (item: NavItem) => {
    if (item.kind === "system_admin")
      return currentUser?.role === "system_admin";
    if (item.kind === "admin_tier") return isAdminTier;
    if (item.kind === "user_management") return isAdminTier;
    if (item.kind === "functionality")
      return isAdminTier || featureKeys.includes(item.featureKey);
    return isAdminTier || reportTemplateKeys.includes(item.templateKey);
  };
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter(canSee) }))
    .filter((group) => group.items.length > 0);

  return <SidebarMenu groups={visibleGroups as SidebarMenuGroup[]} onLogout={logout} />;
}
