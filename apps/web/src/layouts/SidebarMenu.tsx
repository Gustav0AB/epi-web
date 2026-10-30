import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useI18n, type I18nKey } from "../lib/i18n";
import MenuIcon from "@mui/icons-material/Menu";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import LogoutIcon from "@mui/icons-material/Logout";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export type SidebarMenuGroup = {
  label: I18nKey;
  collapsible: boolean;
  items: { to: string; label: I18nKey; icon: ReactNode }[];
};

export function SidebarMenu({ groups, onLogout }: { groups: SidebarMenuGroup[]; onLogout: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<I18nKey>>(() => new Set(["navGroup.main"]));
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    const activeGroup = groups.find((group) => group.items.some((item) => item.to === location.pathname));
    if (!activeGroup?.collapsible) return;
    setOpenGroups((current) => current.has(activeGroup.label) ? current : new Set([...current, activeGroup.label]));
  }, [location.pathname, groups]);

  return (
    <aside className={`flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200 ${expanded ? "w-56" : "w-16"}`}>
      <div className="flex h-14 shrink-0 items-center border-b border-gray-200 px-3">
        <button onClick={() => setExpanded((v) => !v)} title={expanded ? "Collapse sidebar" : "Expand sidebar"} className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900">{expanded ? <MenuOpenIcon /> : <MenuIcon />}</button>
        {expanded && <span className="ml-3 text-base font-semibold text-gray-900">EPI</span>}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4"><ul className="space-y-4">
        {groups.map((group) => <li key={group.label}>
          {expanded && group.collapsible && <button type="button" onClick={() => setOpenGroups((current) => { const next = new Set(current); next.has(group.label) ? next.delete(group.label) : next.add(group.label); return next; })} aria-expanded={openGroups.has(group.label)} className="flex w-full items-center justify-between px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600">{t(group.label)}<ExpandMoreIcon className={openGroups.has(group.label) ? "rotate-180" : ""} fontSize="small" /></button>}
          <ul className={`overflow-hidden space-y-1 transition-all duration-200 ease-in-out ${!group.collapsible || !expanded || openGroups.has(group.label) ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
            {group.items.map((item) => <li key={item.to}><NavLink to={item.to} title={!expanded ? t(item.label) : undefined} className={({ isActive }) => ["flex items-center rounded-md px-2.5 py-2.5 text-base font-medium transition-colors", expanded ? "gap-3" : "justify-center", isActive ? "bg-primary-muted text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"].join(" ")}>{item.icon}{expanded && <span>{t(item.label)}</span>}</NavLink></li>)}
          </ul>
        </li>)}
      </ul></nav>
      <div className="shrink-0 border-t border-gray-200 p-2"><button onClick={onLogout} title={!expanded ? t("header.logout") : undefined} className={`flex w-full items-center rounded-md px-2.5 py-2.5 text-base font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 ${expanded ? "gap-3" : "justify-center"}`}><LogoutIcon className="shrink-0" />{expanded && <span>{t("header.logout")}</span>}</button></div>
    </aside>
  );
}
