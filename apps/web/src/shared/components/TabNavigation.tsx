import { NavLink } from "react-router-dom";

export const tabClass = (active: boolean) => `border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-primary text-primary" : "border-transparent text-gray-600 hover:text-primary"}`;
export function TabNavigation({ label, items }: { label: string; items: { to: string; label: string }[] }) {
  return <nav aria-label={label} className="flex flex-wrap gap-2 border-b border-gray-200">{items.map(item => <NavLink key={item.to} to={item.to} end className={({ isActive }) => tabClass(isActive)}>{item.label}</NavLink>)}</nav>;
}
