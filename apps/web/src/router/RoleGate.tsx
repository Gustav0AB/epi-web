import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import { getDefaultRoute } from "./default-route";
export { getDefaultRoute } from "./default-route";

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
