import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import type { User } from "@epi/shared";
import { useAuthStore } from "../store/auth.store";

// system_admin/org_admin: sin restricción en rutas de gestión/funcionalidad.
// report_viewer y functionality_user son mutuamente excluyentes y cada uno
// solo ve lo que tiene explícitamente asignado (reportTemplateKeys/featureKeys).
export function getDefaultRoute(user: User): string {
  if (user.role === "system_admin" || user.role === "org_admin") return "/home";
  if (user.role === "functionality_user") {
    if (user.featureKeys.includes("home")) return "/home";
    if (user.featureKeys.includes("surveys")) return "/surveys";
    if (user.featureKeys.includes("scoring")) return "/scoring";
    return "/no-access";
  }
  // report_viewer
  if (user.reportTemplateKeys.includes("reports")) return "/reports";
  if (user.reportTemplateKeys.includes("interactive_reports")) return "/interactive-reports";
  return "/no-access";
}

type Props =
  | { allow: "system_admin" }
  | { allow: "admin_tier" }
  | { allow: "user_management" }
  | { allow: "functionality"; featureKey: string }
  | { allow: "report_template"; templateKey: string };

export function RoleGate(props: Props) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const initCurrentUser = useAuthStore((s) => s.initCurrentUser);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void initCurrentUser().finally(() => {
      if (!cancelled) setAttempted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initCurrentUser]);

  useEffect(() => {
    if (attempted && token && !currentUser) logout();
  }, [attempted, token, currentUser, logout]);

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Cargando…
      </div>
    );
  }

  const isAdminTier = currentUser.role === "system_admin" || currentUser.role === "org_admin";
  let allowed: boolean;

  switch (props.allow) {
    case "system_admin":
      allowed = currentUser.role === "system_admin";
      break;
    case "admin_tier":
      allowed = isAdminTier;
      break;
    case "user_management":
      allowed = isAdminTier;
      break;
    case "functionality":
      allowed = isAdminTier || currentUser.featureKeys.includes(props.featureKey);
      break;
    case "report_template":
      allowed = isAdminTier || currentUser.reportTemplateKeys.includes(props.templateKey);
      break;
  }

  if (!allowed) return <Navigate to={getDefaultRoute(currentUser)} replace />;

  return <Outlet />;
}
